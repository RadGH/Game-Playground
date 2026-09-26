// Farhold — the places on the surface: bandit camps, forts, castles, cult circles, beast lairs, and
// the landmarks that are a set piece rather than three models on a coordinate.
//
// Spawning in a ring around the player gives you a world that is evenly, blandly dangerous. A place
// is the opposite: somewhere you can see from a distance, decide to avoid, and come back to when you
// are three levels higher. Three complaints from the play session are all the same complaint:
//
//   * "add enemy structures like castles and forts and camps"
//   * "expand existing landmarks to be larger, more impressive, and not just a couple random models
//      thrown on top of a coordinate location"
//   * "there should be a purpose for going to every point of interest"
//
// So a site here is three things at once. A LAYOUT (`data/setpieces.json`) — an approach you walk up,
// a centre you can see from the next ridge, and surroundings that say who used to be here. A SLOT on
// the world map — a pass, a road junction, a river crossing, a landmark node — so a garrison stands
// where a garrison would stand and not on an arbitrary coordinate. And a PURPOSE
// (`data/strongholds.json` for the hostile ones, `data/landmarks.json` for the rest): a named boss, a
// chest whose grade goes up with the tier, prisoners, standing, a quest hook. `tests/poi.test.js`
// fails if any point of interest has none of those.
//
// A fourth kind of place was added in round 12: a WORLD BOSS (`data/worldbosses.json`). "Add world
// bosses of varying tiers, which are stronger than the level they reside in and are much larger and
// swarming in minions. These events should be displayed on the map for the region you are in." It
// is the same machinery — a slot, a layout, a purpose — with three differences: it is built at its
// zone's level plus `over`, it is two to three times the size of anything else on that ground
// (`def.scale`, folded in by js/actors.js), and it keeps calling bodies up on a clock for as long as
// it is alive. See `populateWorldBoss` and `tickWaves`.
//
//   const sites = createSites(scene, terrain, { seed, balance, zones, collide });
//   sites.update(px, pz);                      // builds the set pieces near you, ticks the waves
//   for (const s of sites.due(px, pz)) …       // hostile sites close enough to fill with bodies
//   await sites.populate(site, { field, chests, nameFor });   // garrison + named boss + the chest
//
// The four JSON files are fetched by this module at IMPORT, not handed in, so nothing outside this
// file had to change to get the places built — and by the time `createSites` is reached (main.js
// grows a star, a system, a planet and a whole terrain first) they are long since back, so the site
// list is built there and then. `sites.ready` is there for anyone who needs to be sure.

import * as THREE from 'three';
import { makeRng } from '../../../worldgen/js/noise.js';
import { BIOMES } from '../../../worldgen/js/biomes.js';
import { brazierBody, currentChests } from './chests.js';
import { M_PER_CELL } from './planet.js';
import { townExtent } from './town-plan.js';   // R27 M2

function mergeParts(parts) {
  let total = 0;
  const prepared = parts.map(p => {
    const g = p.geometry.clone().toNonIndexed();
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

const at = (x, y, z, sx, sy, sz, ry = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));
/** Like `at`, but with all three rotations — a leaning beam needs more than a spin. */
const tilt = (x, y, z, sx, sy, sz, ex = 0, ey = 0, ez = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(ex, ey, ez)), new THREE.Vector3(sx, sy, sz));

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CONE = new THREE.ConeGeometry(1, 1, 5);
const CONE8 = new THREE.ConeGeometry(1, 1, 8);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 7);
const CYL10 = new THREE.CylinderGeometry(1, 1, 1, 10);
const TAPER = new THREE.CylinderGeometry(0.42, 1, 1, 4);
const SPH = new THREE.SphereGeometry(1, 8, 6);
const ICO = new THREE.IcosahedronGeometry(1, 0);

// ---------------------------------------------------------------------------- the pieces
//
// Every piece is built ALONG +X with its front toward +Z. That one rule is what lets a layout say
// "ring of walls, tangent" and get a curtain wall rather than sixteen walls facing the same way:
// see `yawFor` below, where "in" and "tangent" turn out to be the same angle for a piece shaped
// this way, and "out" is that angle turned round.

/** A hide tent: a cone with a pole and a dark mouth. */
function tentBody(hide = '#6a5238', pole = '#3a2e22') {
  return mergeParts([
    { geometry: CONE, color: hide, matrix: at(0, 1.1, 0, 1.5, 2.2, 1.5) },
    { geometry: CYL, color: pole, matrix: at(0, 1.3, 0, 0.06, 2.6, 0.06) },
    { geometry: BOX, color: '#100c08', matrix: at(0, 0.5, 1.05, 0.55, 1, 0.12) },
  ]);
}

export const PIECES = {
  /** A knee-high marker. On its own it is nothing; eight of them in a line is an avenue. */
  waystone: { tall: 2.6, cap: 220, solid: null, build: (stone = '#7d7568') => mergeParts([
    { geometry: BOX, color: stone, matrix: at(0, 1.15, 0, 0.55, 2.3, 0.42) },
    { geometry: BOX, color: stone, matrix: at(0, 0.16, 0, 1.0, 0.32, 0.8) },
    { geometry: BOX, color: '#5d564c', matrix: at(0, 1.9, 0.22, 0.34, 0.3, 0.06) },
  ]) },

  /**
   * R14 — A CAIRN. A STACK OF STONES SOMEBODY BUILT, NOT A HEAP THAT FELL.
   *
   *   "A lot of the structures in this location are too short (seed 1, Hes-Subud IV, biome
   *    Temperate Forest, x 6981, z 2827, altitude 6)."
   *
   * That is the Field of Cairns, and there was no cairn in this file. The layout was built out of
   * `rubble` — a 1.8 m heap of broken stone, which is the right piece for a ruin and the wrong one
   * for a grave marker — so a landmark whose own blurb promises "thirty piles of stone, laid out in
   * rows by somebody careful" was two dozen ankle-high piles of debris scattered round a menhir.
   *
   * This is what the blurb describes: seven stones stacked smallest-at-the-top on a flat footing,
   * 3.4 m to the capstone, each course turned a little off the one below so it reads as stacked
   * rather than extruded. It is solid, because walking through a grave marker is worse than walking
   * round one.
   */
  cairn: { tall: 3.4, cap: 180, solid: [0.85, 3], build: (stone = '#6f6a5e') => mergeParts([
    { geometry: BOX, color: '#5a544a', matrix: at(0, 0.11, 0, 2.0, 0.22, 1.8, 0.2) },
    ...[
      // y, width, depth, spin, tint — narrowing as it goes up, each course turned off the last
      [0.42, 1.62, 1.44, 0.10, stone],
      [0.86, 1.46, 1.30, 0.55, '#65604f'],
      [1.28, 1.30, 1.16, 1.05, stone],
      [1.68, 1.12, 1.00, 1.70, '#6b6659'],
      [2.06, 0.94, 0.86, 2.35, stone],
      [2.42, 0.76, 0.70, 3.00, '#5f5a50'],
      [2.76, 0.58, 0.54, 3.75, stone],
    ].map(([y, w, d, spin, tint]) =>
      ({ geometry: BOX, color: tint, matrix: at(0, y, 0, w, y < 1.3 ? 0.44 : 0.38, d, spin) })),
    // the capstone: a rounded one, set slightly off centre the way a real one always is
    { geometry: ICO, color: '#7b7466', matrix: at(0.07, 3.12, -0.05, 0.46, 0.34, 0.42) },
  ]) },

  /** A proper standing stone — eight metres, not the five the ordinary props scatter. */
  menhir: { tall: 8.2, cap: 70, solid: [0.9, 8], build: (stone = '#6a6459') => mergeParts([
    { geometry: BOX, color: stone, matrix: at(0, 3.8, 0, 1.35, 7.4, 0.85) },
    { geometry: BOX, color: stone, matrix: at(0.1, 7.6, 0, 1.1, 0.7, 0.75, 0.12) },
    { geometry: BOX, color: '#4e4941', matrix: at(0, 0.24, 0, 2.2, 0.48, 1.7) },
  ]) },

  /** Fifteen metres of stepped base and tapering shaft. This is the "visible from the ridge" piece. */
  obelisk: { tall: 15.2, cap: 28, solid: [1.6, 15], build: (stone = '#948b7c') => mergeParts([
    { geometry: BOX, color: '#6f675b', matrix: at(0, 0.45, 0, 5.2, 0.9, 5.2) },
    { geometry: BOX, color: stone, matrix: at(0, 1.35, 0, 3.8, 0.9, 3.8) },
    { geometry: TAPER, color: stone, matrix: at(0, 8.2, 0, 1.5, 12.8, 1.5, 0.3) },
    { geometry: CONE8, color: '#c8b48a', matrix: at(0, 14.8, 0, 0.8, 1.6, 0.8) },
  ]) },

  /** A slab on four legs with a shallow bowl. Wet in the middle of a dry season, at a cult circle. */
  altar: { tall: 2.3, cap: 20, solid: [1.8, 2], build: (stone = '#7a7266') => mergeParts([
    { geometry: BOX, color: stone, matrix: at(0, 1.55, 0, 3.6, 0.5, 2.3) },
    ...[[-1.4, -0.8], [1.4, -0.8], [-1.4, 0.8], [1.4, 0.8]].map(([x, z]) =>
      ({ geometry: BOX, color: '#5f584e', matrix: at(x, 0.65, z, 0.5, 1.3, 0.5) })),
    { geometry: CYL10, color: '#2a2422', matrix: at(0, 1.86, 0, 0.7, 0.16, 0.7) },
    { geometry: BOX, color: '#5f584e', matrix: at(0, 0.12, 0, 4.2, 0.24, 2.9) },
  ]) },

  /** A round stone tower with a walkway and merlons. Seventeen metres to the top of the teeth. */
  tower: { tall: 17.4, cap: 44, solid: [3.4, 17], build: (stone = '#8a8275') => mergeParts([
    { geometry: CYL10, color: '#6f675b', matrix: at(0, 0.5, 0, 3.6, 1.0, 3.6) },
    { geometry: CYL10, color: stone, matrix: at(0, 7.5, 0, 3.0, 14, 3.0) },
    { geometry: CYL10, color: '#7a7264', matrix: at(0, 14.8, 0, 3.5, 0.7, 3.5) },
    ...Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return { geometry: BOX, color: stone, matrix: at(Math.cos(a) * 3.1, 16.1, Math.sin(a) * 3.1, 1.1, 1.9, 0.7, -a) };
    }),
    { geometry: BOX, color: '#120e0a', matrix: at(0, 1.9, 2.95, 1.1, 2.6, 0.3) },
    { geometry: BOX, color: '#120e0a', matrix: at(0, 10.5, 2.95, 0.7, 1.2, 0.3) },
  ]) },

  /** The big one: a square keep with four corner turrets. Twenty-two metres, and meant to be seen. */
  keep: { tall: 22, cap: 10, solid: [8, 22], build: (stone = '#857c6e') => mergeParts([
    { geometry: BOX, color: '#6b6357', matrix: at(0, 0.6, 0, 14.5, 1.2, 12.5) },
    { geometry: BOX, color: stone, matrix: at(0, 8.5, 0, 12.5, 17, 10.5) },
    { geometry: BOX, color: '#6f6659', matrix: at(0, 17.4, 0, 13.6, 0.8, 11.6) },
    ...[[-6.2, -5.2], [6.2, -5.2], [-6.2, 5.2], [6.2, 5.2]].map(([x, z]) =>
      ({ geometry: CYL10, color: stone, matrix: at(x, 10, z, 2.1, 20, 2.1) })),
    ...[[-6.2, -5.2], [6.2, -5.2], [-6.2, 5.2], [6.2, 5.2]].map(([x, z]) =>
      ({ geometry: CONE8, color: '#4e3a2e', matrix: at(x, 21, z, 2.6, 3.0, 2.6) })),
    ...Array.from({ length: 6 }, (_, i) =>
      ({ geometry: BOX, color: stone, matrix: at(-5 + i * 2, 18.4, 0, 1.2, 1.6, 11.8) })),
    { geometry: BOX, color: '#120e0a', matrix: at(0, 2.4, 5.3, 2.2, 4.4, 0.4) },
    ...[-3.5, 0, 3.5].map(x => ({ geometry: BOX, color: '#120e0a', matrix: at(x, 11, 5.3, 0.7, 1.8, 0.4) })),
  ]) },

  /** Nine metres of curtain wall with a walkway and three merlons, built along +x. */
  wall: { tall: 7.4, cap: 210, solid: [4.6, 7], build: (stone = '#8a8275') => mergeParts([
    { geometry: BOX, color: '#6f675b', matrix: at(0, 0.4, 0, 9.4, 0.8, 2.2) },
    { geometry: BOX, color: stone, matrix: at(0, 3.3, 0, 9, 5.8, 1.6) },
    { geometry: BOX, color: '#7a7264', matrix: at(0, 6.4, 0, 9.4, 0.5, 2.4) },
    ...[-3.2, 0, 3.2].map(x => ({ geometry: BOX, color: stone, matrix: at(x, 7.0, 0, 2.0, 1.4, 1.6) })),
  ]) },

  /** The way in: an arch between two squat turrets. A ring of wall with one of these is a fort. */
  gatehouse: { tall: 11.5, cap: 14, solid: [5.4, 11], solids: [[-4.4, 0, 2.1], [4.4, 0, 2.1], [-2.4, 0, 0.9], [2.4, 0, 0.9]], build: (stone = '#8a8275') => mergeParts([
    ...[-4.4, 4.4].map(x => ({ geometry: BOX, color: stone, matrix: at(x, 4.8, 0, 3.4, 9.6, 3.4) })),
    ...[-4.4, 4.4].map(x => ({ geometry: BOX, color: '#7a7264', matrix: at(x, 10.0, 0, 4.0, 0.8, 4.0) })),
    ...[-5.4, -4.4, 4.4, 5.4].map(x => ({ geometry: BOX, color: stone, matrix: at(x, 10.9, 0, 0.8, 1.2, 3.6) })),
    { geometry: BOX, color: stone, matrix: at(0, 7.8, 0, 6.4, 3.6, 2.8) },
    { geometry: BOX, color: stone, matrix: at(0, 5.6, 0, 6.4, 1.0, 3.2) },
    ...[-2.4, 2.4].map(x => ({ geometry: BOX, color: stone, matrix: at(x, 3.0, 0, 1.6, 6, 2.8) })),
    { geometry: BOX, color: '#3a2a1c', matrix: at(0, 2.4, 0, 3.2, 4.8, 0.3) },
  ]) },

  /** Sharpened stakes and a rail, six metres of it, built along +x. */
  palisade: { tall: 3.6, cap: 300, solid: [3.2, 3.4], build: (wood = '#5a4632') => mergeParts([
    ...Array.from({ length: 8 }, (_, i) => {
      const x = -2.8 + i * 0.8;
      return { geometry: CYL, color: wood, matrix: at(x, 1.5, 0, 0.19, 3.0, 0.19, i * 0.7) };
    }),
    ...Array.from({ length: 8 }, (_, i) =>
      ({ geometry: CONE, color: '#6b5640', matrix: at(-2.8 + i * 0.8, 3.2, 0, 0.2, 0.7, 0.2) })),
    { geometry: CYL, color: '#4a3a28', matrix: tilt(0, 2.3, -0.18, 0.12, 6.2, 0.12, 0, 0, Math.PI / 2) },
  ]) },

  tent: { tall: 2.6, cap: 70, solid: [1.4, 2.4], build: tentBody },

  /** A cage on a post, with somebody's last argument still in it. Freeing them is 7.15. */
  cage: { tall: 4.4, cap: 28, solid: [0.9, 4], build: (iron = '#3f3a36', wood = '#4a3a28') => mergeParts([
    { geometry: CYL, color: wood, matrix: at(0, 2.0, 0, 0.22, 4.0, 0.22) },
    { geometry: BOX, color: wood, matrix: tilt(0.6, 3.9, 0, 0.14, 1.6, 0.14, 0, 0, Math.PI / 2) },
    { geometry: CYL10, color: iron, matrix: at(1.2, 3.05, 0, 0.72, 0.12, 0.72) },
    { geometry: CYL10, color: iron, matrix: at(1.2, 1.55, 0, 0.72, 0.12, 0.72) },
    ...Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return { geometry: CYL, color: iron, matrix: at(1.2 + Math.cos(a) * 0.62, 2.3, Math.sin(a) * 0.62, 0.06, 1.6, 0.06) };
    }),
    { geometry: BOX, color: '#403830', matrix: at(0, 0.2, 0, 1.2, 0.4, 1.2) },
  ]) },

  /** A heap of what a lair eats. A den with no bone field around it reads as a hole. */
  bonepile: { tall: 2.6, cap: 90, solid: [1.2, 1.4], build: (bone = '#cfc7ae') => mergeParts([
    { geometry: ICO, color: '#8d8674', matrix: at(0, 0.35, 0, 1.9, 0.5, 1.7) },
    ...Array.from({ length: 7 }, (_, i) => {
      const a = i * 0.9;
      return { geometry: CYL, color: bone, matrix: tilt(Math.cos(a) * 0.7, 0.5 + (i % 3) * 0.22, Math.sin(a) * 0.7, 0.1, 2.2, 0.1, 0.2 * i, a, Math.PI / 2 - 0.25 * (i % 4)) };
    }),
    ...Array.from({ length: 5 }, (_, i) => {
      const s = i % 2 ? 1 : -1;
      return { geometry: CYL, color: bone, matrix: tilt(s * 0.9, 1.1, -0.9 + i * 0.45, 0.07, 2.1, 0.07, 0, 0, s * 0.42) };
    }),
    { geometry: SPH, color: bone, matrix: at(-0.2, 1.85, 0.5, 0.52, 0.42, 0.66) },
    { geometry: CYL, color: bone, matrix: tilt(0, 2.0, 0, 0.12, 2.6, 0.12, Math.PI / 2, 0, 0) },
  ]) },

  /** The mouth of a den: an earth bank with a black hole in it and a path worn flat to the door. */
  // R16: a `den` is the centre of most instance mouths as well as the beast lairs, and twelve
  // sites in range all building their centre overran a cap of 16 — `put()` drops the overflow in
  // silence, which reads as a cave with no mouth on it.
  den: { tall: 6.4, cap: 52, solid: [3.6, 5], build: (earth = '#5b4c3a', rock = '#6e675c') => mergeParts([
    { geometry: ICO, color: earth, matrix: at(0, 1.4, -1.6, 7.2, 4.6, 5.6) },
    { geometry: ICO, color: earth, matrix: at(-4.2, 0.9, 0.6, 3.0, 2.4, 2.6, 0.7) },
    { geometry: ICO, color: earth, matrix: at(4.4, 1.0, 0.4, 3.2, 2.6, 2.8, 1.9) },
    { geometry: BOX, color: '#0a0806', matrix: at(0, 1.5, 1.5, 3.4, 3.0, 1.6) },
    { geometry: ICO, color: rock, matrix: at(-2.6, 1.9, 1.9, 1.5, 1.6, 1.2) },
    { geometry: ICO, color: rock, matrix: at(2.7, 2.0, 1.8, 1.6, 1.7, 1.2, 1.1) },
    { geometry: BOX, color: '#4a4034', matrix: at(0, 3.5, 1.2, 4.6, 1.1, 2.4) },
  ]) },

  /** A pole and a hanging cloth. Whoever holds a place puts one of these where you can see it. */
  banner: { tall: 9.2, cap: 50, solid: [0.4, 9], build: (pole = '#4a3a28', cloth = '#7a2e2a') => mergeParts([
    { geometry: CYL, color: pole, matrix: at(0, 4.4, 0, 0.16, 8.8, 0.16) },
    { geometry: CYL, color: pole, matrix: tilt(0.7, 8.4, 0, 0.09, 1.7, 0.09, 0, 0, Math.PI / 2) },
    { geometry: BOX, color: cloth, matrix: at(0.75, 6.4, 0, 1.5, 3.6, 0.07) },
    { geometry: CONE, color: cloth, matrix: at(0.75, 4.3, 0, 1.5, 1.4, 0.07) },
    { geometry: BOX, color: '#3a3028', matrix: at(0, 0.18, 0, 0.9, 0.36, 0.9) },
  ]) },

  /** Stacked wood, waiting. Lit, it is what makes a camp visible from a kilometre off. */
  pyre: { tall: 2.9, cap: 40, solid: [1.3, 1.6], build: (wood = '#4a3a28') => mergeParts([
    ...Array.from({ length: 4 }, (_, i) => ({
      geometry: CYL, color: wood,
      matrix: tilt(0, 0.28 + i * 0.34, 0, 0.17, 2.6, 0.17, 0, i * (Math.PI / 4), Math.PI / 2),
    })),
    ...Array.from({ length: 5 }, (_, i) => {
      const a = (i / 5) * Math.PI * 2;
      return { geometry: CYL, color: '#5a4632', matrix: tilt(Math.cos(a) * 0.6, 1.7, Math.sin(a) * 0.6, 0.11, 2.3, 0.11, Math.sin(a) * 0.32, 0, -Math.cos(a) * 0.32) };
    }),
  ]) },

  /** Broken masonry. Five of these scattered out past the wall is what "used to be bigger" looks like. */
  rubble: { tall: 1.8, cap: 220, solid: null, build: (stone = '#7f776a') => mergeParts([
    { geometry: BOX, color: stone, matrix: at(0, 0.38, 0, 1.7, 0.76, 1.2, 0.4) },
    { geometry: BOX, color: '#6e675c', matrix: at(0.9, 0.7, -0.4, 0.9, 1.4, 0.8, 1.2) },
    { geometry: ICO, color: stone, matrix: at(-0.8, 0.3, 0.6, 0.6, 0.45, 0.55) },
    { geometry: BOX, color: '#6e675c', matrix: tilt(-0.3, 0.85, -0.7, 0.7, 1.5, 0.6, 0.35, 0.8, 0.4) },
  ]) },

  /** A throwing engine: legs, a counterweight and an arm still cocked. */
  engine: { tall: 7.4, cap: 20, solid: [2.4, 6], build: (wood = '#4a3a28', iron = '#3f3a36') => mergeParts([
    ...[-1.6, 1.6].map(z => ({ geometry: BOX, color: wood, matrix: at(0, 0.3, z, 5.2, 0.6, 0.6) })),
    ...[[-1.8, -1.6], [1.8, -1.6], [-1.8, 1.6], [1.8, 1.6]].map(([x, z]) =>
      ({ geometry: CYL, color: wood, matrix: tilt(x, 2.4, z, 0.22, 5.0, 0.22, 0, 0, x > 0 ? -0.34 : 0.34) })),
    { geometry: CYL, color: wood, matrix: tilt(0, 4.7, 0, 0.2, 4.0, 0.2, Math.PI / 2, 0, 0) },
    { geometry: CYL, color: wood, matrix: tilt(0, 4.6, -1.4, 0.19, 6.4, 0.19, 0.95, 0, 0) },
    { geometry: BOX, color: iron, matrix: at(0, 6.7, 0.9, 1.0, 1.1, 1.0) },
    { geometry: CYL10, color: iron, matrix: at(0, 1.3, -3.2, 0.8, 0.5, 0.8) },
  ]) },

  /** A small stone house with a thatched cone. Courtyards, farmsteads, a ferryman's hut. */
  hut: { tall: 6.6, cap: 40, solid: [3.0, 6], build: (stone = '#8a8275', roof = '#5a4632') => mergeParts([
    { geometry: BOX, color: stone, matrix: at(0, 1.8, 0, 5.2, 3.6, 4.4) },
    { geometry: CONE8, color: roof, matrix: at(0, 4.9, 0, 4.4, 3.0, 3.9) },
    { geometry: BOX, color: '#120e0a', matrix: at(0, 1.1, 2.25, 1.1, 2.2, 0.3) },
    { geometry: BOX, color: '#120e0a', matrix: at(-1.7, 2.3, 2.25, 0.8, 0.8, 0.3) },
    { geometry: BOX, color: stone, matrix: at(2.0, 4.6, -1.0, 0.8, 3.4, 0.8) },
  ]) },

  /** A hull on its side, ribs open to the sky, the mast snapped off short. */
  hull: { tall: 9.4, cap: 12, solid: [4.5, 5], build: (wood = '#4a3f33') => mergeParts([
    { geometry: CYL10, color: wood, matrix: tilt(0, 1.8, 0, 2.6, 13, 2.6, Math.PI / 2, 0, 0.42) },
    ...Array.from({ length: 6 }, (_, i) => ({
      geometry: CYL, color: '#5b4f40',
      matrix: tilt(0.4, 3.4, -4.6 + i * 1.9, 0.16, 6.2, 0.16, 0, 0, 0.42),
    })),
    { geometry: CYL, color: wood, matrix: tilt(1.6, 5.4, 0.6, 0.28, 8.6, 0.28, 0.2, 0, 0.5) },
    { geometry: BOX, color: '#6a6055', matrix: tilt(2.6, 8.2, 0.9, 1.6, 1.2, 0.12, 0, 0.3, 0.5) },
    { geometry: ICO, color: '#6e675c', matrix: at(-3.4, 0.5, 3.6, 1.4, 0.8, 1.2) },
  ]) },
};

export const PIECE_KEYS = Object.keys(PIECES);

// ---------------------------------------------------------------------------- placement helpers

/**
 * Which way a piece faces on a ring.
 *
 * Every piece is built along +x with its front toward +z, which makes "facing the centre" and
 * "lying along the ring" the SAME angle — a wall laid tangentially has its face pointing inward,
 * which is what a curtain wall is. Getting this wrong is how you end up with sixteen walls all
 * pointing the same way and a fort you can walk straight through.
 */
function yawFor(rotate, a, rng) {
  if (rotate === 'random') return rng() * Math.PI * 2;
  if (rotate === 'out') return -a + Math.PI / 2;
  return -a - Math.PI / 2;            // 'in' and 'tangent'
}

/** Loose ground tags for a slot, so landmarks.json's `on` and `biomes` lists can be matched. */
const GROUND_TAGS = {
  grassland: ['grass', 'farmland'], savanna: ['grass', 'scrub'], shrubland: ['scrub', 'grass'],
  temperateForest: ['forest'], rainforest: ['forest', 'wetland'], borealForest: ['forest'],
  beach: ['coast'], marsh: ['wetland', 'river'], desert: ['scrub'], badlands: ['highland', 'scrub'],
  tundra: ['highland'], ice: ['highland'], hills: ['highland', 'grass'],
  mountains: ['mountain', 'highland'], snowyPeaks: ['mountain'], volcanic: ['mountain', 'highland'],
  blighted: ['wetland', 'forest'], ashPlain: ['scrub', 'highland'], veiledHills: ['highland'],
  hallowed: ['forest', 'grass'], glimmerwaste: ['highland', 'scrub'],
};

/** Weighted pick that never returns undefined for a non-empty list. */
function weighted(list, r) {
  const total = list.reduce((s, e) => s + (e.weight || 1), 0);
  let roll = r * total;
  for (const e of list) { roll -= (e.weight || 1); if (roll <= 0) return e; }
  return list[list.length - 1];
}

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * THE THREE FILES, FETCHED AT IMPORT.
 *
 * They have to be loaded — this module is imported, not awaited, and nothing outside it had to
 * change to get the places built. But starting the fetch inside `createSites` was a real race: the
 * Playwright spec lands, asks `sites.sites` on the next line and finds an empty list, because the
 * fetch had not come back yet. Starting it at IMPORT means it is finished long before `createSites`
 * is reached — main.js generates a star, a system, a planet and a whole terrain in between — so the
 * cache below is warm and the site list is built there and then, synchronously. `ready` is still
 * handed out for anyone who wants to be certain.
 */
let CACHE = null;
/** R27 M1 — a stair's gate id: past the instance mouths (40000+) and the world's own node ids. */
const STAIR_ID_BASE = 60000;
const grab = name => fetch(new URL(`../data/${name}.json`, import.meta.url)).then(r => r.json());
const SITE_DATA = Promise.all([
  grab('strongholds'), grab('setpieces'), grab('landmarks'), grab('worldbosses'),
  // R16 — the twenty instanced places: a cave mouth, an abandoned farmstead, a dragon's lair.
  grab('instances').catch(() => null),
])
  .then(([strongholds, setpieces, landmarks, worldbosses, instances]) => {
    CACHE = { strongholds, setpieces, landmarks, worldbosses, instances };
    return CACHE;
  })
  .catch(() => null);     // no places this run; the rest of the world still stands

// ---------------------------------------------------------------------------- the sites

export function createSites(scene, terrain, {
  seed = 1, balance = {}, zones = null, collide = null, radius = 2600, data = null,
  /**
   * R27 M1 — the keys of the strongholds already TAKEN on this world, out of the save. A taken
   * site never refills its boss, its prisoners or its strongbox and never pays again; one whose
   * `gives.clears` is set is cleared outright and stays empty. See `take()`.
   */
  taken = null,
} = {}) {
  // The LIVE cell size, not the 640 that `data/balance.json` still writes down: the title screen's
  // planet-scale knob moves it, and a camp placed at `cell * 640` on a 128 m-per-cell world lands
  // five times outside the map.
  const cell = terrain.metresPerCell || M_PER_CELL;

  /** How many set pieces get built in full. Past this only the centre goes up — see `update`. */
  const FULL = 5;
  /** How many sites are considered at all. Twelve was the old number and it still reads right. */
  const SHOWN = 12;

  let strongholds = data?.strongholds || CACHE?.strongholds || null;
  let setpieces = data?.setpieces || CACHE?.setpieces || null;
  let landmarkData = data?.landmarks || CACHE?.landmarks || null;
  let worldBossData = data?.worldbosses || CACHE?.worldbosses || null;
  let instanceData = data?.instances || CACHE?.instances || null;
  let sites = [];
  let shown = [];
  let lastPoint = null;

  /**
   * The chest field, for the two things this module has to put on the ground itself.
   *
   * `populate` is handed one by main.js and we keep it; `currentChests()` is the fallback so a
   * monument still gets its cache on a run where the player has not walked into a stronghold yet.
   * `setChests` is the front door for whoever eventually wires it properly.
   */
  let chestField = null;
  const theChests = () => chestField || currentChests();

  /** Live world-boss fights: one record per boss that is up, holding its swarm and its clock. */
  const waves = [];

  // one InstancedMesh per piece, plus the fire, which is shared with the chest field's brazier
  const meshes = {};
  for (const key of PIECE_KEYS) {
    const m = new THREE.InstancedMesh(PIECES[key].build(), new THREE.MeshLambertMaterial({ vertexColors: true }), PIECES[key].cap);
    m.count = 0; m.visible = false; m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.name = 'farhold-site-' + key;
    scene.add(m);
    meshes[key] = m;
  }
  const fireMesh = new THREE.InstancedMesh(brazierBody('#4a4038', '#ff9040'), new THREE.MeshLambertMaterial({ vertexColors: true }), 40);
  fireMesh.count = 0; fireMesh.visible = false; fireMesh.frustumCulled = false;
  fireMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fireMesh.name = 'farhold-site-fires';
  scene.add(fireMesh);

  const fires = [];
  const m4 = new THREE.Matrix4();

  /** Every settlement and port, with the ring of ground it keeps clear. See `townGap`. */
  const towns = ((terrain.world?.nodes) || [])
    .filter(n => n.type === 'settlement' || n.type === 'port')
    .map(n => ({ x: n.x * cell, z: n.y * cell, guard: 190 + (n.size ?? 1) * 120, node: n }));

  // The warm path — the cache is already full, so there is no wait and no empty first frame.
  let ready = Promise.resolve(null);
  if (strongholds && setpieces && landmarkData) {
    sites = buildSites();
    restoreTaken();
  } else {
    // …and the cold one, for a page that reached here before the three files came back.
    ready = SITE_DATA.then(d => {
      if (!d) return null;
      strongholds = d.strongholds; setpieces = d.setpieces; landmarkData = d.landmarks;
      worldBossData = d.worldbosses;
      // R27 M1 — the instance list too: the cold path never set it, so the first world built before
      // the files came back had no instances at all, and a stair had no instance to open
      instanceData = instanceData || d.instances;
      sites = buildSites();
      restoreTaken();
      if (lastPoint) update(lastPoint[0], lastPoint[1], true);
      return d;
    });
  }

  // ---------------------------------------------------------------- which places exist, and where

  /**
   * EVERY SLOT A PLACE COULD SIT IN.
   *
   * The complaint was that things were "thrown on top of a coordinate location". A slot is the
   * opposite of a coordinate: a pass, a river crossing, a landmark node, a road, a cell two roads
   * meet at. A fort at a pass is a fort somebody built for a reason.
   */
  function slotsFrom(world) {
    const out = [];
    const nodes = world?.nodes || [];
    for (const n of nodes) {
      const on = n.type === 'landmark' ? 'landmark'
        : n.type === 'pass' ? 'pass'
        : n.type === 'dungeon' ? 'dungeon'
        : n.type === 'crossing' ? 'crossing' : null;
      if (!on) continue;
      out.push({ key: `n${n.id}`, on, x: n.x * cell, z: n.y * cell, cell: { x: n.x, y: n.y }, name: n.name, biome: n.biome, tags: n.tags || [], id: n.id });
    }

    // roads: a watchtower stands ON the road it watches, not in the field beside it. Junctions are
    // the cells two different roads share — a real crossroads, which is where a toll goes.
    const w = world?.width || 0;
    const seen = new Map();
    let rid = 0;
    for (const road of world?.roads || []) {
      const cells = road.cells || [];
      for (const c of cells) {
        const at = seen.get(c);
        if (at === undefined) seen.set(c, rid);
        else if (at !== rid && at >= 0) seen.set(c, -1);   // -1 means "more than one road here"
      }
      // a slot a quarter, a half and three quarters of the way along, so a long road is not empty
      for (const f of [0.25, 0.5, 0.75]) {
        const c = cells[Math.floor(cells.length * f)];
        if (c === undefined || !w) continue;
        const x = (c % w) * cell, z = ((c / w) | 0) * cell;
        out.push({ key: `r${road.id}:${f}`, on: 'road', x, z, cell: { x: c % w, y: (c / w) | 0 }, name: null, biome: null, tags: ['road'], id: 9000 + road.id * 4 + f * 4 });
      }
      rid++;
    }
    let j = 0;
    for (const [c, mark] of seen) {
      if (mark !== -1 || !w) continue;
      if (j++ % 3) continue;                                // thin them out; a crossroads every so often
      const x = (c % w) * cell, z = ((c / w) | 0) * cell;
      out.push({ key: `j${c}`, on: 'junction', x, z, cell: { x: c % w, y: (c / w) | 0 }, name: null, biome: null, tags: ['road', 'junction'], id: 20000 + c });
    }
    return out;
  }

  /** How far a layout reaches from its centre — the widest ring or scatter it puts down. */
  function layoutRadius(key) {
    const l = setpieces?.layouts?.[key];
    if (!l) return 20;
    let r = 12;
    for (const ring of l.rings || []) r = Math.max(r, ring.radius || 0);
    for (const sc of l.scatter || []) r = Math.max(r, sc.radius || 0);
    // R14: a grid has a corner, not a radius — half the diagonal is how far it actually reaches.
    // Without this a Field of Cairns would be allowed to overlap the next site by twenty metres.
    for (const g of l.grids || []) {
      const w = ((g.cols || 1) - 1) * (g.gapX ?? 6) / 2 + (g.jitter || 0);
      const h = ((g.rows || 1) - 1) * (g.gapZ ?? 6) / 2 + (g.jitter || 0);
      r = Math.max(r, Math.hypot(w, h));
    }
    return r;
  }

  /**
   * HOW MUCH ROOM A SETTLEMENT KEEPS AROUND ITSELF.
   *
   * Found in a screenshot: a fort's keep standing inside the walls of a city, because a road
   * junction slot happened to fall on a city's own streets. `field.wild()` already stops bodies
   * spawning inside a town's watch, so the garrison never appeared — but the GEOMETRY did, and a
   * castle in the middle of somebody's market is the most obvious possible bug.
   *
   * Returns metres of clear ground between a point and the nearest settlement's watch: negative
   * means you are inside it.
   */
  function townGap(x, z) {
    let best = Infinity;
    for (const t of towns) {
      // R27 M2: the keep-clear gap is legitimately wider than the town, but never narrower than
      // its real wall plus a margin — asked each time, because a town is planned after this list
      // is made and the planner may have grown it
      const guard = Math.max(t.guard, townExtent(t.node).wall + 60);
      const d = Math.hypot(t.x - x, t.z - z) - guard;
      if (d < best) best = d;
    }
    return best;
  }

  /**
   * R21 — the road nearest a point: which way it runs there, and how wide it is.
   *
   * `terrain.roadPaths` carries each route's smoothed polyline and its own `half`, which is the one
   * honest source for "where does the carriageway end" — `js/planet.js` builds the ribbon from the
   * same number. A trail is 4.5 m across and a highway 7, so a single constant could never have
   * been right for both.
   */
  function roadNear(x, z, within = 60) {
    let best = null, bestD = within;
    for (const path of terrain.roadPaths || []) {
      const pts = path.points || path.pts || [];
      for (let i = 1; i < pts.length; i++) {
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
        const dx = bx - ax, dz = bz - az;
        const len2 = dx * dx + dz * dz;
        if (!len2) continue;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
        const px = ax + dx * t, pz = az + dz * t;
        const d = Math.hypot(x - px, z - pz);
        if (d >= bestD) continue;
        bestD = d;
        best = { heading: Math.atan2(dz, dx), half: path.half ?? 3.5, distance: d };
      }
    }
    return best;
  }

  /**
   * R21 — walk a point out of a town's ring, or say there is nowhere to go.
   *
   * Used by `claimLandmarks`. The spiral is deliberately coarse and bounded: a landmark wants to be
   * near where the zone put it, so if there is no clear ground within a couple of hundred metres
   * the honest answer is to build nothing rather than to fling a wayshrine over the horizon.
   */
  function nudgeClear(x, z, want = 200) {
    if (townGap(x, z) > want) return [x, z];
    for (let r = 60; r <= 260; r += 40) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (townGap(px, pz) <= want) continue;
        if (terrain.underwater?.(px, pz)) continue;
        if (terrain.roadAt?.(px, pz) > 0.45) continue;
        if (terrain.slopeAt?.(px, pz, 6) > 0.55) continue;
        return [px, pz];
      }
    }
    return null;
  }

  /** Ground tags for a slot, so the `on`/`biomes` lists in both data files can be matched. */
  function tagsFor(slot) {
    const tags = new Set([slot.on, ...(slot.tags || [])]);
    // A road or junction slot carries no biome from the map — it is a cell of a path, not a place —
    // so ask the ground what it is standing on.
    const key = slot.biome || BIOMES[terrain.biomeIdAt?.(slot.x, slot.z) ?? -1]?.key || null;
    for (const t of GROUND_TAGS[key] || []) tags.add(t);
    if (key) tags.add(key);
    return tags;
  }

  /** Turn the slots into real places: what stands here, what it gives, and what band it belongs to. */
  function buildSites() {
    const kinds = strongholds?.kinds || [];
    const layouts = setpieces?.layouts || {};
    const marks = landmarkData?.landmarks || [];
    const chance = strongholds?.chance || { landmark: 0.45, pass: 0.5, dungeon: 0.5, crossing: 0.35, road: 0.16, junction: 0.45 };
    const wbKinds = worldBossData?.bosses || [];
    const wbChance = worldBossData?.chance || {};
    const out = [];
    for (const slot of slotsFrom(terrain.world)) {
      // A road cell can sit on a ford, and a landmark node can sit a metre above the tide line. A
      // castle with its courtyard under water is not a castle, so the wet slots are simply dropped.
      if (terrain.underwater?.(slot.x, slot.z)) continue;
      /**
       * ROUND 17 — AND A SLOT IS NEVER ON A BRIDGE.
       *
       * `slotsFrom` puts a slot on a road cell and on every cell two roads share, and a `crossing`
       * node is by definition where a road meets a river. A bridge's footprint is a hole: `heightAt`
       * leaves the channel carved under it so the water runs through, and a watchtower standing
       * there stands in mid-air over a river — which is what the user reported as *"there is a tower
       * inside of the bridge"*. Measured on their world, 49 of 356 slots were inside one.
       *
       * The `underwater` line above happens to catch most of them today, because the ground under a
       * bridge is usually still river. That is luck, not a rule: a shallow crossing leaves the bed
       * above the waterline and the slot reads perfectly dry. `bridgedAt` asks the question that is
       * actually being asked, and with the layout's own radius, because a fort is thirty metres
       * across and its middle clearing the deck proves nothing about its walls.
       */
      if (terrain.bridgedAt?.(slot.x, slot.z, 12)) continue;
      const zone = zones?.at(slot.x, slot.z) || null;
      const band = zone?.band ?? 1;
      const rng = makeRng((seed ^ (slot.id * 2654435761)) >>> 0);
      const tags = tagsFor(slot);

      const gap = townGap(slot.x, slot.z);

      /**
       * R16 — AN INSTANCE GETS FIRST REFUSAL, BEFORE EVEN THE WORLD BOSSES.
       *
       *   "Add about 20 new overworld events that feature an instance system. It could be an
       *    abandoned building, a cave entrance, a dungeon entrance. These take you to a different
       *    zone similar to our current dungeon system where a quest can be found, or a boss to
       *    kill. Have one be a dragons lair, which can both be discovered randomly or through a
       *    quest from someone in town or elsewhere."
       *
       * First refusal because World Forge marks only a handful of `dungeon` nodes on a planet, so
       * anything that queues behind the strongholds ends up never appearing: a fort wants a pass,
       * a camp wants a junction, and between them they take every slot worth having. An instance
       * is the rarest thing on the list and the only one that leads anywhere, so it goes first and
       * its own `chance` keeps it rare.
       *
       * `discovery: "quest"` entries are deliberately NOT rolled onto slots — those exist only
       * when somebody in a town sends you to one, which is the other half of the dragon-lair ask.
       */
      const instKinds = (instanceData?.instances || []).filter(i => i.discovery !== 'quest');
      const instChance = instanceData?.chance || { dungeon: 0.55, landmark: 0.16, pass: 0.18, crossing: 0.12, road: 0.05, junction: 0.1 };
      const instFits = instKinds.filter(i => {
        if (!(i.on || []).some(t => tags.has(t))) return false;
        if ((i.minBand ?? 0) > band) return false;
        if (i.maxBand != null && band > i.maxBand) return false;
        if (!layouts[i.plan]) return false;
        const b = i.biomes || ['any'];
        if (!b.includes('any') && !b.some(t => tags.has(t))) return false;
        return gap > (i.townGap ?? 200);
      });
      if (instFits.length && rng() < (instChance[slot.on] ?? 0.08)) {
        const spec = weighted(instFits, rng());
        out.push({
          id: slot.id, key: slot.key,
          kind: 'instance', type: spec.id, family: 'instance', plan: spec.plan, spec,
          instance: spec,
          name: slot.name && slot.on === 'dungeon' ? slot.name : spec.name,
          blurb: spec.blurb, does: 'Go in.',
          gives: spec.gives || {}, faction: null, hostile: false,
          tier: 0, arch: spec.arch || 'stone',
          x: slot.x, z: slot.z, cell: slot.cell, zone,
          level: Math.max(1, (zone?.midLevel ?? 1) + (spec.interior?.overLevel ?? 0)),
          pin: { color: '#b090ff', r: 3.6, glyph: spec.icon || 'dungeon' },
          populated: false, cleared: false,
        });
        continue;
      }

      /**
       * A WORLD BOSS GETS FIRST REFUSAL ON A SLOT.
       *
       * Rolled before the garrisons because a fort and a world boss both want a pass, and if the
       * garrison wins every time you never see one. The chances in data/worldbosses.json are a
       * tenth or so per eligible slot, which is eight or nine on a whole planet: enough that the
       * region you are standing in usually has one, few enough that it is still the thing you tell
       * somebody about.
       *
       * The clearance is 60 m wider than a stronghold's. The arena is where the swarm comes up, and
       * a swarm spilling into a village is a bug and not a set piece.
       */
      const wbFits = wbKinds.filter(w => {
        if (!(w.on || []).includes(slot.on)) return false;
        if ((w.minBand ?? 0) > band) return false;
        if (!layouts[w.plan]) return false;
        const b = w.biomes || ['any'];
        if (!b.includes('any') && !b.some(t => tags.has(t))) return false;
        return gap > layoutRadius(w.plan) + 60;
      });
      if (wbFits.length && rng() < (wbChance[slot.on] ?? 0)) {
        const spec = weighted(wbFits, rng());
        out.push({
          id: slot.id, key: slot.key,
          // `kind` is its own word so nothing that switches on 'camp' or 'lair' picks it up by
          // accident; `family` is what the rest of this file tests.
          kind: 'worldboss', type: spec.id, family: 'worldboss', plan: spec.plan, spec,
          worldBoss: true, tier: spec.tier || 1,
          name: spec.name, blurb: spec.blurb,
          gives: spec.gives || {}, faction: null, hostile: true,
          x: slot.x, z: slot.z, cell: slot.cell, zone,
          // THE 'stronger than the level they reside in' HALF. The zone's own mid-level is what
          // everything else here is built at; this is that plus the boss's `over`.
          zoneLevel: zone?.midLevel ?? 1,
          level: (zone?.midLevel ?? 1) + (spec.over || 0),
          pin: {
            color: spec.pin?.color || '#ff3a3a',
            r: spec.pin?.r ?? (5.5 + (spec.tier || 1)),
            glyph: 'worldboss', icon: '\u2620',
          },
          populated: false, cleared: false,
        });
        continue;
      }

      const fits = kinds.filter(k => {
        if (!(k.on || []).includes(slot.on)) return false;
        if ((k.minBand ?? 1) > band) return false;
        if (!layouts[k.plan]) return false;
        // A siege camp is SUPPOSED to be outside a town's gate — that is the whole idea of it — so
        // it wants to be near one, just never inside. Everything else keeps its own width clear.
        if (k.nearSettlement) return gap > 40 && gap < 700;
        return gap > layoutRadius(k.plan) + 30;
      });
      const wantStronghold = fits.length && rng() < (chance[slot.on] ?? 0.3);

      if (wantStronghold) {
        const spec = weighted(fits, rng());
        out.push({
          id: slot.id, key: slot.key,
          // `kind` stays 'camp' or 'lair' so anything still switching on the old two words keeps
          // working; `type` is what the place actually is.
          kind: spec.kind === 'beast_lair' ? 'lair' : 'camp',
          type: spec.kind, family: 'stronghold', plan: spec.plan, spec,
          name: slot.name || `${spec.name} of the ${cap(slot.on)}`,
          blurb: spec.blurb, gives: spec.gives || {}, faction: spec.faction || null,
          tier: spec.tier || 1, hostile: true,
          x: slot.x, z: slot.z, cell: slot.cell, zone, level: zone?.midLevel ?? 1,
          // 7.20 / 8.17: a fort and a lair must not be the same dot. `glyph` is the kind's own
          // silhouette from the data file; `color` and `r` are what the map already understood.
          pin: { color: spec.tier >= 4 ? '#ff4a4a' : spec.tier === 3 ? '#ff6a3a' : '#ffa860', r: 2.6 + spec.tier * 0.7, glyph: spec.icon || 'camp' },
          populated: false, cleared: false,
        });
        continue;
      }

      // Not a garrison, then — a landmark, and a landmark with a purpose. `data/landmarks.json`
      // already said what each one GIVES; until now nothing put one on the ground.
      //
      // Road and junction slots are the many: three per road and a crossroads every third cell. If
      // every one of them grew a shrine the road would be a shopfront, so most of them stay empty.
      const onRoad = slot.on === 'road' || slot.on === 'junction';
      if (onRoad && rng() > 0.25) continue;
      const pool = marks.filter(m =>
        layouts[m.kind] &&
        (m.on || []).some(t => tags.has(t)) &&
        ((m.biomes || ['any']).includes('any') || (m.biomes || []).some(t => tags.has(t))));
      const spec = pool.length ? weighted(pool, rng()) : marks.find(m => layouts[m.kind]);
      if (!spec) continue;
      // A shrine may stand at a village's gate; it may not stand in its square.
      if (gap < layoutRadius(spec.kind) * 0.6) continue;
      out.push({
        id: slot.id, key: slot.key,
        kind: 'landmark', type: spec.kind, family: 'landmark', plan: spec.kind, spec,
        name: slot.name || spec.name, blurb: spec.blurb, does: spec.does,
        gives: spec.gives || {}, faction: spec.faction || null,
        // the fields main.js's `atLandmark` reads off a territory record, so a set piece can be
        // handed straight to it; `cell` is the map cell both sit on, which is how they are joined
        steps: spec.solve ? (spec.steps || 1) : 0, done: 0,
        tier: 0, hostile: false,
        x: slot.x, z: slot.z, cell: slot.cell, zone, level: zone?.midLevel ?? 1,
        pin: { color: '#8fd0ff', r: 3, glyph: spec.icon || 'shrine' },
        populated: false, cleared: false,
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- building one place

  /**
   * Put a layout on the ground around (site.x, site.z).
   *
   * `full` false builds only the centre — that is how a castle keep is still on the skyline from two
   * kilometres out without paying for its walls, its huts and its eighty waystones as well.
   */
  function buildLayout(site, counts, full) {
    const layout = setpieces?.layouts?.[site.plan];
    if (!layout) return;
    const rng = makeRng((seed ^ (site.id * 40503) ^ 0x51ed) >>> 0);
    const cx = site.x, cz = site.z;


    const put = (piece, x, z, yaw, scale = 1, yOff = 0) => {
      const mesh = meshes[piece];
      if (!mesh) return;
      const n = counts[piece] || 0;
      if (n >= mesh.instanceMatrix.count) return;
      const [wx, wz] = terrain.clampToWorld ? terrain.clampToWorld(x, z) : [x, z];
      m4.compose(new THREE.Vector3(wx, terrain.heightAt(wx, wz) + yOff, wz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
        new THREE.Vector3(scale, scale, scale));
      mesh.setMatrixAt(n, m4);
      counts[piece] = n + 1;
      const solid = PIECES[piece].solid, legs = PIECES[piece].solids;
      /**
       * R25 — a gatehouse is solid in its turrets and gate posts, not in its gateway: one circle at
       * the middle blocked the very opening the piece exists to provide. `solids` is [x, z, r] in
       * model space, turned by the same yaw.
       */
      if (legs && collide) {
        const c = Math.cos(yaw), sn = Math.sin(yaw);
        for (const [lx, lz, r] of legs) collide.add(wx + (lx * c + lz * sn) * scale, wz + (-lx * sn + lz * c) * scale, r * scale, solid[1] * scale);
      } else if (solid && collide) collide.add(wx, wz, solid[0] * scale, solid[1] * scale);
    };

    /**
     * R21 — A SPENT LANDMARK LEAVES DEBRIS, IT DOES NOT STAND THERE REPEATING ITSELF.
     *
     * The play-test, on a Forge Fire at a town centre: *"Worst of all it doesn't go away, it just
     * stays there saying 'you have already had what there is to have here'… The event should just
     * go away, it's fine if it leaves some sort of debris behind as a signal of 'this event is
     * complete'."*
     *
     * `taken` was already recorded (round 16 took the map pin off), but nothing here ever read it,
     * so the geometry stood forever. Now a taken one-shot builds a scatter of rubble instead of its
     * own layout — the place is still a place, it is visibly finished, and `interactTarget` in
     * js/main.js no longer offers it.
     *
     * THE COLLIDER IS WHY THIS IS A REPLACEMENT AND NOT A REMOVAL. As js/eventprops.js documents,
     * a collider filed with `collide.add` cannot be taken back — the obstacle field has no delete.
     * Rubble carries `solid: null`, so swapping the plan at build time files no collider at all and
     * nothing invisible is left behind; the whole instanced set is rebuilt from scratch on every
     * `update`, so the swap costs nothing.
     */
    if (site.taken && site.family === 'landmark') {
      const ring = makeRng((seed ^ (site.id * 7919) ^ 0xd06f) >>> 0);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + ring() * 0.6;
        const r = 1.2 + ring() * 3.4;
        put('rubble', cx + Math.cos(a) * r, cz + Math.sin(a) * r, ring() * Math.PI * 2, 0.8 + ring() * 0.5);
      }
      return;
    }

    for (const c of layout.centre || []) {
      put(c.piece, cx + (c.x || 0), cz + (c.z || 0), (c.spin ?? 0) + rng() * 0.2, c.scale ?? 1, c.y || 0);
    }
    if (!full) return;

    for (const ring of layout.rings || []) {
      const count = ring.count || 1;
      for (let i = 0; i < count; i++) {
        if ((ring.skip || []).includes(i)) continue;
        const turn = ring.angle != null && count === 1
          ? ring.angle
          : (i / count) + (ring.offset || 0);
        const a = turn * Math.PI * 2;
        const jitter = ring.jitter || 0;
        const r = ring.radius + (jitter ? (rng() - 0.5) * jitter * 2 : 0);
        put(ring.piece,
          cx + Math.cos(a) * r, cz + Math.sin(a) * r,
          yawFor(ring.rotate || 'in', a, rng),
          (ring.scale ?? 1) * (jitter ? 0.9 + rng() * 0.2 : 1), ring.y || 0);
      }
    }

    /**
     * R14 — ROWS. Because some places were laid out by somebody, not weathered into a circle.
     *
     * The layout schema could say "ring" and "scatter" and nothing else, so the Field of Cairns —
     * whose own blurb in data/landmarks.json reads "thirty piles of stone, laid out in ROWS by
     * somebody careful" — was two concentric circles of rubble. A ring reads as ritual and a grid
     * reads as a graveyard, and the difference is the whole character of the place.
     *
     * `{ piece, cols, rows, gapX, gapZ, jitter, scale, spin, skip }`. The grid is centred on the
     * site and turned by `spin`, so it is not always square to the compass. `jitter` is metres of
     * slop on each one: enough that it was dug by hand, not enough to lose the rows.
     */
    for (const g of layout.grids || []) {
      const cols = Math.max(1, g.cols || 1), rws = Math.max(1, g.rows || 1);
      const gx = g.gapX ?? 6, gz = g.gapZ ?? 6;
      const spin = g.spin ?? rng() * Math.PI * 2;
      const cos = Math.cos(spin), sin = Math.sin(spin);
      let n = 0;
      for (let r = 0; r < rws; r++) {
        for (let c = 0; c < cols; c++, n++) {
          if ((g.skip || []).includes(n)) continue;
          const lx = (c - (cols - 1) / 2) * gx + (g.jitter ? (rng() - 0.5) * g.jitter * 2 : 0);
          const lz = (r - (rws - 1) / 2) * gz + (g.jitter ? (rng() - 0.5) * g.jitter * 2 : 0);
          put(g.piece,
            cx + lx * cos - lz * sin, cz + lx * sin + lz * cos,
            spin + (g.wobble ?? 0.12) * (rng() - 0.5) * 2,
            (g.scale ?? 1) * (1 - (g.vary ?? 0.12) / 2 + rng() * (g.vary ?? 0.12)), g.y || 0);
        }
      }
    }

    // THE APPROACH. This is the difference between a set piece and a pile: markers that start sixty
    // metres out and walk you in, so you know you have arrived somewhere before you get there.
    /**
     * R21 — THE WAYSTONES STAND BESIDE THE ROAD, NOT IN IT.
     *
     * The play-test: *"there are some small pillars that appear to be going in the direction of the
     * road. However, they are off center, spilling into the middle of the road."* Both halves of
     * that sentence were true, and they were two separate bugs:
     *
     *   1. **The bearing was pure chance** — `heading = rng() * TAU`. A slot created ON a road cell
     *      or at a junction never asked which way the road ran, so an avenue of waystones marched
     *      across the carriageway at whatever angle the dice gave it. It only LOOKED like it was
     *      following the road when the dice happened to agree.
     *   2. **The offset was a bare constant.** `off = lane * app.spread`, with `spread` written in
     *      `data/setpieces.json` as 3.2 / 3.4 / 3.6 / 4.5 and never once compared to the road. A
     *      road-class carriageway is 7 m wide, so its edge is at 3.5 m, and a waystone's own footing
     *      is 0.5 m across — three of the four layouts were therefore INSIDE the painted road by
     *      construction. Compare `proctown/js/buildkit.js`, which does the same job correctly for
     *      market stalls: `off = street.width / 2 + offset`.
     *
     * So the avenue now takes its bearing from the road it belongs to, and its offset is the road's
     * own half-width plus the piece's own footing plus a clear metre — the data's `spread` becomes a
     * floor rather than the answer.
     */
    const app = layout.approach;
    if (app) {
      const road = roadNear(cx, cz, 60);
      const heading = road ? road.heading : rng() * Math.PI * 2;
      const side = heading + Math.PI / 2;
      // the piece's own half-footprint, so a wide stone is pushed out further than a narrow one
      const foot = (PIECES[app.piece]?.solid?.[0] ?? 0.5) * (app.scale ?? 1);
      const clear = road ? road.half + foot + 1.0 : 0;
      for (let i = 0; i < (app.count || 0); i++) {
        const t = app.count === 1 ? 0 : i / (app.count - 1);
        const d = (app.from ?? 50) + t * ((app.to ?? 18) - (app.from ?? 50));
        const lanes = app.both ? [-1, 1] : [0];
        for (const lane of lanes) {
          const off = lane * Math.max(app.spread ?? 3, clear);
          const x = cx + Math.cos(heading) * d + Math.cos(side) * off;
          const z = cz + Math.sin(heading) * d + Math.sin(side) * off;
          // …and a last word from the ground itself, in case the road bends away under the avenue
          if (terrain.roadAt?.(x, z) > 0.45) continue;
          put(app.piece, x, z, -heading + Math.PI / 2 + (rng() - 0.5) * 0.25, (app.scale ?? 1) * (0.9 + rng() * 0.2));
        }
      }
    }

    for (const sc of layout.scatter || []) {
      const inner = sc.inner ?? 0;
      for (let i = 0; i < (sc.count || 0); i++) {
        const a = rng() * Math.PI * 2;
        const r = inner + rng() * Math.max(0.1, (sc.radius ?? 20) - inner);
        put(sc.piece, cx + Math.cos(a) * r, cz + Math.sin(a) * r, rng() * Math.PI * 2, (sc.scale ?? 1) * (0.8 + rng() * 0.4));
      }
    }

    for (const f of layout.fires || []) {
      if (fires.length >= fireMesh.instanceMatrix.count) break;
      const a = (f.a || 0) * Math.PI * 2;
      const fx = cx + Math.cos(a) * (f.r || 0), fz = cz + Math.sin(a) * (f.r || 0);
      const fy = terrain.heightAt(fx, fz);
      m4.compose(new THREE.Vector3(fx, fy, fz), new THREE.Quaternion(), new THREE.Vector3(1.1, 1.1, 1.1));
      fireMesh.setMatrixAt(fires.length, m4);
      fires.push({ x: fx, y: fy + 1.8, z: fz });
      collide?.add(fx, fz, 0.6, 2);
    }
  }

  let lastCentre = null;
  function update(px, pz, force = false) {
    lastPoint = [px, pz];
    /**
     * TWO THINGS THAT HAVE TO HAPPEN EVERY FRAME, above the movement guard.
     *
     * The rest of `update` only runs when you have moved 180 m, which is right for rebuilding
     * instance buffers and wrong for anything with a clock in it. main.js calls this every frame on
     * the surface, so the swarm clock and the monument caches go here — before the early return, or
     * a world boss would only call a wave when you happened to walk a furlong.
     */
    tickWaves(px, pz);
    if ((furnishIn -= 1) <= 0) { furnishIn = 20; furnishLandmarks(px, pz); }
    if (!force && lastCentre && Math.hypot(px - lastCentre[0], pz - lastCentre[1]) < 180) return;
    lastCentre = [px, pz];
    shown = sites
      .map(s => ({ s, d: Math.hypot(s.x - px, s.z - pz) }))
      .filter(e => e.d < radius)
      .sort((a, b) => a.d - b.d)
      .slice(0, SHOWN)
      .map(e => e.s);

    const counts = {};
    fires.length = 0;
    for (let i = 0; i < shown.length; i++) {
      const s = shown[i];
      s.y = terrain.heightAt(s.x, s.z);
      /**
       * R21 — A LANDMARK IS ALWAYS BUILT IN FULL, HOWEVER MANY SITES ARE IN RANGE.
       *
       * The play-test: *"At the town center there is an event 'E look at forge fire' [but] there is
       * no fire, it's just a building."* And there genuinely was no fire — `layouts.forge_fire`
       * declares two fires, two banners, six waystones and an approach, and `buildLayout` throws
       * all of it away after the centre piece unless the site is one of the nearest FIVE of the
       * twelve shown. At a town centre plenty of sites are in range, so the forge fire lost that
       * contest every time and rendered as a lone hut — a building with a name and nothing to
       * explain it.
       *
       * The nearest-five rule is a sensible budget for scenery. It is the wrong rule for the one
       * kind of site the game asks you to walk up to and press a key at, so a landmark opts out.
       * There are only ever a few per zone, and a spent one is seven pieces of rubble.
       */
      buildLayout(s, counts, i < FULL || s.family === 'landmark');
    }
    for (const key of PIECE_KEYS) {
      const m = meshes[key];
      m.count = counts[key] || 0;
      m.visible = m.count > 0;
      m.instanceMatrix.needsUpdate = true;
    }
    fireMesh.count = fires.length;
    fireMesh.visible = fires.length > 0;
    fireMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- filling one with bodies

  /**
   * THE GARRISON, THE NAMED BOSS AND THE CHEST.
   *
   * "Let's also add bandit camps to the system which should have treasure chests to loot and bosses
   * / quests tied to them." All three come from `data/strongholds.json`, so a new kind of place is a
   * JSON entry and not a branch in here: the garrison size and what it prefers, the boss's rank, how
   * many champion modifiers it wears and which epithets it may be given, and the chest grade — which
   * is `iron` at a bandit camp and `warded` at a castle, so the walk is paid in proportion.
   *
   * `nameFor(def, rng)` is Name Forge; without it a boss still gets a name, built from its epithet
   * and the place it holds.
   */
  async function populate(site, { field, chests = null, nameFor = null, level = null } = {}) {
    const out = { boss: null, chest: null, garrison: [], prisoners: 0 };
    if (!site || !field) return out;
    // keep the chest field: the monument caches in `furnishLandmarks` have no other way to get one
    if (chests) chestField = chests;
    if (site.family === 'worldboss') return populateWorldBoss(site, { field, chests: chests || theChests(), level });
    const spec = site.spec;
    const lvl = level ?? site.level ?? 1;
    const rng = field.rng;

    if (!site.hostile || !spec?.garrison) return out;
    // R27 M1 — a taken stronghold is somewhere you already won. Bodies may come back to it (only
    // when its `gives.clears` is off — otherwise `due()` never hands it back at all), but no boss,
    // no prisoners and no strongbox: those are what taking it paid for, and they are paid once.
    const won = !!site.taken;

    const all = field.defsFor(site.x, site.z, lvl);
    if (!all.length) return out;
    const want = spec.garrison.prefer || {};
    const narrowed = all.filter(d =>
      (!want.families || want.families.includes(d.family)) &&
      (!want.roles || want.roles.includes(d.role)));
    const pool = narrowed.length ? narrowed : all;

    // the boss first, in the middle of it
    const bossSpec = spec.boss || {};
    if (won) {
      // nobody in charge any more
    } else if (bossSpec.rank === 'boss') {
      const def = field.bossFor(lvl, site.x, site.z);
      // R27 M1 — with the modifiers the data gives it, through the same path a champion's take
      if (def) out.boss = await field.placeBoss(def, lvl, site.x, site.z, { modifiers: bossSpec.modifiers ?? 0 });
    } else {
      const leaders = pool.filter(d => d.role === 'leader');
      const def = rng.pick(leaders.length ? leaders : pool);
      const modifiers = field.rpg.pickModifiers(field.modifiers, bossSpec.modifiers ?? 1, rng);
      out.boss = await field.add(def, lvl, site.x, site.z, {
        rank: bossSpec.rank || 'champion', modifiers, name: bossName(site, def, nameFor, rng),
      });
    }
    if (out.boss) { out.boss.siteKey = site.key; out.boss.holdsSite = site.key; }

    const span = spec.garrison.count || [4, 6];
    const n = span[0] + Math.floor(rng() * (span[1] - span[0] + 1));
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, r = 5 + rng() * (8 + (spec.tier || 1) * 4);
      const [x, z] = terrain.clampToWorld(site.x + Math.cos(a) * r, site.z + Math.sin(a) * r);
      if (terrain.underwater(x, z)) continue;
      const rank = i === 0 ? field.rpg.rollRank(rng, { bonus: spec.garrison.rankBonus || 1 }) : 'normal';
      const unit = await field.addRanked(rng.pick(pool), lvl, x, z, rank);
      if (unit) { unit.siteKey = site.key; out.garrison.push(unit); }
    }

    // and the chest it is all standing around
    if (chests && spec.chest?.kind && !won) {
      const a = rng() * Math.PI * 2, r = 3 + (spec.tier || 1);
      out.chest = chests.place(spec.chest.kind, site.x + Math.cos(a) * r, site.z + Math.sin(a) * r,
        { level: lvl, facing: rng() * Math.PI * 2, name: `${site.name}: the Strongbox` });
      // R25 — the strongbox belongs to the garrison: it stays shut until they are down
      if (out.chest) out.chest.guards = [...out.garrison, ...(out.boss ? [out.boss] : [])];
    }
    out.prisoners = won ? 0 : (site.gives?.prisoners || 0);
    return out;
  }

  // ---------------------------------------------------------------- R27 M1: taking one

  /**
   * THE STAIR DOWN, for a stronghold whose `gives.opensDungeon` says there is one.
   *
   * `opensDungeon` was three log lines ("Behind the keep, a stair goes down"). A stair is a mouth:
   * the same `{ id, name, kind, x, z, instance }` node `mouths()` hands js/dungeon.js's
   * `createGates`, so `E` at it runs the ordinary `enterDungeon` with an instance entry from
   * data/instances.json — a string names the instance, `true` falls back to the vault.
   *
   * Placed 14-34 m from the centre, on dry, walkable ground that no set-piece collider covers,
   * searched in a fixed order from the site's own seed so a reload puts it in the same place.
   */
  function stairFor(site) {
    const want = site.gives?.opensDungeon;
    if (!want) return null;
    const list = instanceData?.instances || [];
    const spec = (typeof want === 'string' && list.find(i => i.id === want))
      || list.find(i => i.id === 'sealed_strongroom') || list[0] || null;
    if (!spec) return null;
    const rng = makeRng((seed ^ (Number(site.id) * 2246822519) ^ 0x57a1) >>> 0);
    const start = rng() * Math.PI * 2;
    let spot = null;
    for (let r = 18; r <= 34 && !spot; r += 4) {
      for (let k = 0; k < 12 && !spot; k++) {
        const a = start + (k / 12) * Math.PI * 2;
        const [x, z] = terrain.clampToWorld(site.x + Math.cos(a) * r, site.z + Math.sin(a) * r);
        if (terrain.underwater?.(x, z)) continue;
        if ((terrain.slopeAt?.(x, z, 3) ?? 0) > 0.6) continue;
        if (collide?.blocked?.(x, z, 3)) continue;
        spot = { x, z };
      }
    }
    if (!spot) {
      // all the way round is water or wall: stand it at the nearest dry step off the centre
      const [x, z] = terrain.clampToWorld(site.x + Math.cos(start) * 14, site.z + Math.sin(start) * 14);
      spot = { x, z };
    }
    return {
      id: STAIR_ID_BASE + (Number(site.id) % 20000),
      name: `The stair under ${site.name}`,
      kind: 'instance', x: spot.x, z: spot.z, zone: site.zone,
      arch: spec.arch || 'stone', instance: spec, siteKey: site.key, stair: true,
    };
  }

  /** Mark one cleared, so it stops refilling. A function declaration so `restoreTaken` can run first. */
  function clearKey(key) {
    const s = sites.find(v => v.key === key);
    if (s) { s.cleared = true; s.populated = true; }
    return s || null;
  }

  /** Everything that makes a site taken, in one place, so the save and a live take agree. */
  function markTakenStronghold(s) {
    s.taken = true;
    s.heldFolk = [];
    s.bossUnit = null;
    // `gives.clears`: taking it CLEARS it — the existing `clear()` below, which nothing called
    if (s.gives?.clears) clearKey(s.key);
    if (s.gives?.opensDungeon && !s.stair) s.stair = stairFor(s);
    if (s.pin) s.pin = { ...s.pin, color: '#8a8a8a' };
  }

  function restoreTaken() {
    if (!taken) return;
    const keys = new Set([...(taken || [])].map(String));
    for (const s of sites) if (s.family === 'stronghold' && keys.has(String(s.key))) markTakenStronghold(s);
  }

  /** `<a Name Forge given name> <epithet>`, or something that still reads as a name without one. */
  function bossName(site, def, nameFor, rng) {
    const list = site.spec?.boss?.epithets || [];
    const epithet = list.length ? list[Math.floor(rng() * list.length) % list.length] : 'the Held Ground';
    const given = nameFor ? nameFor(def, rng) : null;
    return given ? `${given} ${epithet}` : `${cap(epithet.replace(/^(the|who|of) /, ''))} of ${site.name}`;
  }

  // ---------------------------------------------------------------- world bosses

  /** `[min,max]` -> a whole number in that range. */
  const span = (pair, rng) => {
    const [lo, hi] = pair || [1, 1];
    return lo + Math.floor(rng() * Math.max(1, hi - lo + 1));
  };

  /** What may be called up as this boss's swarm: what lives here, narrowed by what it prefers. */
  function minionPool(rec) {
    const field = rec.field;
    const all = field.defsFor(rec.site.x, rec.site.z, rec.level);
    if (!all.length) return [];
    const want = rec.spec.minions?.prefer || {};
    const fits = all.filter(d =>
      (!want.families || want.families.includes(d.family)) &&
      (!want.roles || want.roles.includes(d.role)));
    return fits.length ? fits : all;
  }

  /**
   * Bring `n` more bodies up around the boss.
   *
   * Two caps, and both matter. `minions.max` is how many of ITS swarm may be alive at once, which is
   * what stops a fight you are losing from becoming a fight you cannot walk away from. The enemy
   * field's own `maxAlive` is the frame-rate cap, and we stop four short of it so the ordinary
   * spawner is not starved out by one very loud place.
   *
   * `awake` is what makes a reinforcement a reinforcement: the first lot are standing about when you
   * arrive, everything after that arrives already coming at you.
   */
  async function addMinions(rec, n, { awake = false } = {}) {
    const spec = rec.spec.minions || {};
    const field = rec.field;
    const rng = field.rng;
    const pool = minionPool(rec);
    if (!pool.length) return [];
    const maxAlive = balance.spawn?.maxAlive ?? 38;
    const lvl = Math.max(1, Math.round(rec.level * (spec.weaken ?? 0.8)));
    const made = [];
    for (let i = 0; i < n; i++) {
      if (rec.minions.length >= (spec.max ?? 10)) break;
      if (field.enemies.length + field.pending > maxAlive - 4) break;
      const a = rng() * Math.PI * 2;
      const r = 8 + rng() * Math.max(2, (spec.radius ?? 26) - 8);
      const [x, z] = terrain.clampToWorld(rec.site.x + Math.cos(a) * r, rec.site.z + Math.sin(a) * r);
      if (terrain.underwater(x, z) || !field.wild(x, z)) continue;
      const rank = field.rpg.rollRank(rng, { bonus: spec.rankBonus || 1 });
      const unit = await field.addRanked(rng.pick(pool), lvl, x, z, rank);
      if (!unit) continue;
      unit.siteKey = rec.key;
      unit.minionOf = rec.key;
      if (awake) { unit.state = 'chase'; unit.aggroRange = Math.max(unit.aggroRange, 70); }
      rec.minions.push(unit);
      made.push(unit);
    }
    return made;
  }

  /**
   * PUT A WORLD BOSS UP.
   *
   * Everything that makes it a world boss rather than a large enemy is in the data: the level it is
   * built at already carries `over`, `def.scale` makes it two to three times the size of anything
   * else on this ground (js/actors.js folds it in and widens the reach with it), `def.fx` gives it
   * looping auras so it is lit up before it moves, and `minions` is the swarm that keeps coming.
   *
   * The chest stands in the arena from the start rather than dropping on the kill. That is
   * deliberate: the chest field has no death hook to hang a drop on, and a warded chest you can see
   * from the approach — with the thing standing between you and it — is a better reason to go than
   * a promise.
   */
  async function populateWorldBoss(site, { field, chests, level }) {
    const out = { boss: null, chest: null, garrison: [], prisoners: 0, worldBoss: true };
    const spec = site.spec;
    if (!spec) return out;
    const lvl = Math.max(1, Math.round(level ?? site.level ?? 1));
    const rng = field.rng;

    const unit = await field.add(spec, lvl, site.x, site.z, { boss: true });
    if (!unit) return out;
    unit.boss = true;
    unit.siteKey = site.key;
    unit.worldBoss = spec.id;
    unit.tier = spec.tier || 1;
    unit.aggroRange = spec.aggroRange ?? 56;
    out.boss = unit;

    if (chests && spec.chest?.kind) {
      const a = rng() * Math.PI * 2, r = 9 + (spec.tier || 1) * 2;
      const [cx, cz] = terrain.clampToWorld(site.x + Math.cos(a) * r, site.z + Math.sin(a) * r);
      out.chest = chests.place(spec.chest.kind, cx, cz, {
        key: `worldboss:${site.key}`, level: lvl, facing: rng() * Math.PI * 2,
        name: `${spec.name}: the Hoard`,
      });
      // R25 — the hoard is the boss's: it stays shut until the boss is down
      if (out.chest) out.chest.guards = [unit];
    }

    const rec = { key: site.key, site, spec, field, level: lvl, boss: unit, minions: [], t: 0 };
    waves.push(rec);
    await addMinions(rec, span(spec.minions?.first || [4, 6], rng));
    out.garrison = rec.minions.slice();

    field.onLog?.(`${spec.name} is here, and it is not the size of anything else in this region.`, 'bad');
    return out;
  }

  /**
   * THE SWARM CLOCK.
   *
   * "swarming in minions" is not a headcount at spawn time — it is bodies that keep arriving while
   * the boss lives, so the fight has a shape: clear the floor, get some damage in, clear the floor
   * again. This runs off the wall clock rather than a `dt`, because the only per-frame call this
   * module is given is `update(px, pz)` and it carries no time with it. Capped at half a second so a
   * tab that was in the background does not empty six waves at once on the frame it comes back.
   *
   * Waves only run while you are near enough to be in the fight; walk away and the boss stands there
   * with whatever is left of its swarm. It never despawns — js/actors.js refuses to clean up a boss —
   * and the site is marked cleared the moment it goes down, so it does not come back.
   */
  let waveClock = null;
  function tickWaves(px, pz) {
    if (!waves.length) { waveClock = null; return; }
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const dt = waveClock == null ? 0 : Math.min(0.5, Math.max(0, (now - waveClock) / 1000));
    waveClock = now;
    for (let i = waves.length - 1; i >= 0; i--) {
      const rec = waves[i];
      const boss = rec.boss;
      if (!boss || boss.dying != null) {
        // KILLED. The place is finished and stops refilling.
        rec.site.cleared = true;
        rec.site.populated = true;
        waves.splice(i, 1);
        rec.field.onLog?.(`${rec.spec.name} goes down. Whatever was coming for it stops coming.`, 'loot');
        continue;
      }
      if (boss.removed) {
        /**
         * TAKEN OFF THE BOARD WITHOUT DYING.
         *
         * `field.clear()` empties the whole enemy field, and three ordinary things call it: going
         * down into a dungeon, landing on a world, and rebuilding the world around a teleport. The
         * first draft read that as a kill — so walking into a cave beside a world boss quietly
         * finished it, and coming back out you found a marked, cleared, empty arena. It is not
         * dead: drop the record and let the site be filled again next time you come near it.
         */
        rec.site.populated = false;
        waves.splice(i, 1);
        continue;
      }
      rec.minions = rec.minions.filter(u => u && !u.removed && u.dying == null);
      const near = Math.hypot(rec.site.x - px, rec.site.z - pz);
      if (near > (rec.spec.minions?.range ?? 260)) continue;
      rec.t += dt;
      const spec = rec.spec.minions || {};
      if (rec.t < (spec.every ?? 14)) continue;
      rec.t = 0;
      if (rec.minions.length >= (spec.max ?? 10)) continue;
      addMinions(rec, span(spec.add || [2, 3], rec.field.rng), { awake: true });
      if (spec.announce) rec.field.onLog?.(spec.announce, 'bad');
    }
  }

  /** Is this site's boss still standing? Used by `relax` so a live fight is never doubled up. */
  function waveFor(key) { return waves.find(w => w.key === key) || null; }

  // ---------------------------------------------------------------- 4.12: nothing is decorative

  /**
   * A CACHE BESIDE EVERY MONUMENT.
   *
   * "Any sort of monuments that don't do anything currently need to do something, either part of a
   * quest, or at the very least contain a chest nearby with loot." The fourteen landmarks all
   * declare a `gives` block, but the only code that reads it is main.js's `atLandmark`, which is fed
   * by the territory layer and not by the set pieces standing on the ground — so walking up to the
   * standing stones you can SEE has always been worth exactly nothing. A cache fixes that without
   * needing anything outside this file: `data/landmarks.json` says the grade, how far out it sits
   * and what it is called, and the chest field does the rest.
   *
   * Safe to run more than once. A cache that was looted stays looted; one that was cleaned up
   * because you walked out of range comes back when you walk in again.
   *
   * R19 — `atLandmark` is no longer the only reader. `js/encounters.js` now reads one key off the
   * `gives` block copied onto every site above: `callsBeast`, the rank of the thing a hunting
   * blind's bait hook or a Beast Lair draws to it. See `beastCallOf` there — it is why the site
   * objects this file builds carry `gives`, `hostile`, `cleared` and `taken` at all.
   */
  let furnishIn = 0;
  function furnishLandmarks(px, pz) {
    const chests = theChests();
    if (!chests) return;
    for (const s of sites) {
      const cache = s.spec?.cache;
      if (s.family !== 'landmark' || !cache || s.cacheTaken) continue;
      if (s.cacheChest) {
        if (s.cacheChest.opened) { s.cacheTaken = true; s.cacheChest = null; continue; }
        if (chests.chests.includes(s.cacheChest)) continue;      // still standing where we left it
        s.cacheChest = null;                                     // range-culled; put it back below
      }
      if (Math.hypot(s.x - px, s.z - pz) > 150) continue;
      // A ferry landing and a sunken wreck both stand at the waterline, so the first angle rolled is
      // often in the sea. Walk round the place rather than giving up on it — a monument that quietly
      // never got its cache because of one unlucky angle is the bug this whole item is about.
      const rng = makeRng((seed ^ (s.id * 2246822519) ^ 0xca5e) >>> 0);
      const start = rng() * Math.PI * 2, r = cache.at ?? 9;
      let spot = null;
      for (let i = 0; i < 8 && !spot; i++) {
        const a = start + (i / 8) * Math.PI * 2;
        const [x, z] = terrain.clampToWorld(s.x + Math.cos(a) * r, s.z + Math.sin(a) * r);
        if (!terrain.underwater?.(x, z)) spot = [x, z];
      }
      if (!spot) continue;                       // all the way round is water; try again next pass
      s.cacheChest = chests.place(cache.kind || 'wooden', spot[0], spot[1], {
        key: `landmark:${s.key}`, level: s.level || 1,
        facing: rng() * Math.PI * 2, name: cache.name || `${s.name}: the Cache`,
      });
    }
  }

  /** Sites close enough to fill with bodies, and not filled yet. Each comes back once. */
  function due(px, pz, range = 150) {
    const out = [];
    for (const s of shown) {
      if (!s.hostile || s.populated || s.cleared) continue;
      if (Math.hypot(s.x - px, s.z - pz) > range) continue;
      s.populated = true;
      /**
       * R14 — A CAMP INTRODUCES ITSELF ONCE.
       *
       * `relax()` below deliberately un-populates a site you have walked 420 m away from, so the
       * world is not used up — that is right, and it stays. But the caller announces everything
       * `due()` hands back, so walking away from a bandit camp and back again announced it again,
       * and again, for the whole run. `announced` is separate from `populated` precisely because
       * they mean different things: one is "is there anybody here right now", the other is "have
       * you ever been told about this place". `relax()` clears the first and never the second.
       */
      s.fresh = !s.announced;
      s.announced = true;
      out.push(s);
    }
    return out;
  }

  /** Walking far enough away lets a site be filled again, so the world is not used up. */
  function relax(px, pz, range = 420) {
    for (const s of sites) {
      // …except a world boss that is still standing. It never despawns, so letting the site be
      // filled again would put a SECOND one on the same coordinate the moment you walked back.
      if (s.family === 'worldboss' && waveFor(s.key)) continue;
      if (s.populated && !s.cleared && Math.hypot(s.x - px, s.z - pz) > range) s.populated = false;
    }
  }

  const api = {
    get sites() { return sites; },
    /** Resolves once the four data files are in and the site list is built. */
    ready,
    update, due, relax, populate,
    get visible() { return shown; },
    /** Every world boss on this planet, cleared or not — what a map layer or a quest would read. */
    get worldBosses() { return sites.filter(s => s.family === 'worldboss'); },
    /**
     * R16 — every instanced place on this planet, in the node shape `createGates({ extra })` wants.
     * Ids are offset past the world's own node ids and past js/sites.js's road (9000) and junction
     * (20000) slots, so a mouth can never shadow a real dungeon.
     */
    mouths() {
      return sites.filter(s => s.family === 'instance').map(s => ({
        id: 40000 + (s.id % 20000), name: s.name, kind: 'instance',
        x: s.x, z: s.z, zone: s.zone, cleared: !!s.cleared,
        arch: s.arch, instance: s.instance, siteKey: s.key,
      // R27 M1 — and the stair a taken stronghold opened
      })).concat(sites.filter(s => s.stair || (s.taken && s.gives?.opensDungeon))
        .map(s => (s.stair = s.stair || stairFor(s)))
        .filter(Boolean)
        .map(st => ({ ...st, cleared: false })));
    },
    /** The ones that are up right now, with their swarm. */
    liveBosses: () => waves.map(w => ({
      key: w.key, id: w.spec.id, name: w.spec.name, tier: w.spec.tier,
      x: w.site.x, z: w.site.z, level: w.level,
      hp: w.boss?.hp ?? 0, maxHp: w.boss?.maxHp ?? 0, minions: w.minions.length,
    })),
    /** Hand over the chest field, so monuments get their caches and a boss gets its hoard. */
    setChests(c) { if (c) chestField = c; },
    /** The nearest place you are standing in, whether it fights back or not. */
    nearest: (x, z, range = 40) => {
      let best = null, bestD = range;
      for (const s of shown) { const d = Math.hypot(s.x - x, s.z - z); if (d < bestD) { bestD = d; best = s; } }
      return best;
    },
    /** Mark one cleared, so it stops refilling. */
    clear: clearKey,

    /**
     * R27 M1 — TAKE A STRONGHOLD, ONCE.
     *
     * The one guard on the payout. js/main.js's `payStronghold` asks this and pays exactly what it
     * hands back; a second call — the boss of a refilled site, a second path, a reload — gets null.
     * Before this the only guard was emptying `heldFolk`, and `relax()` + `due()` + `populateSite`
     * refilled it every time you walked 420 m away and back: a castle's legendary chest and perk
     * point on a loop.
     */
    take(key) {
      const s = sites.find(v => String(v.key) === String(key));
      if (!s || s.family !== 'stronghold' || s.taken) return null;
      markTakenStronghold(s);
      return { site: s, gives: { ...(s.gives || {}) }, stair: s.stair || null };
    },
    /**
     * R27 M1 — the stair a LANDMARK's `gives.opensDungeon` promises. A landmark's once-only rule is
     * the territory record's (`takeLandmark`), so this only files the mouth; the caller rebuilds
     * the gates. Null if the site promises no stair.
     */
    openStair(key) {
      const s = sites.find(v => String(v.key) === String(key));
      if (!s || !s.gives?.opensDungeon) return null;
      s.stair = s.stair || stairFor(s);
      return s.stair;
    },
    /** The keys of every stronghold taken on this world, for the save. */
    takenKeys: () => sites.filter(s => s.family === 'stronghold' && s.taken).map(s => s.key),
    /** The site a boss holds, if it holds one — how main.js knows a kill was a take. */
    heldBy(unit) {
      if (!unit || unit.holdsSite == null) return null;
      return sites.find(s => s.key === unit.holdsSite && s.family === 'stronghold') || null;
    },

    /** Every instance kind this file knows about, including the ones it will not scatter. */
    instanceKinds: () => (instanceData?.instances || []),

    /**
     * R16 — PUT A QUEST-ONLY PLACE ON THE GROUND.
     *
     *   "Have one be a dragons lair, which can both be discovered randomly or through a quest from
     *    someone in town or elsewhere."
     *
     * Four of the twenty carry `discovery: "quest"`, which means `buildSites` deliberately never
     * scatters them: they are not somewhere you stumble across, they are somewhere you are SENT.
     * That is only true if something can do the sending — otherwise they are four entries in a JSON
     * file that nothing reads, which is the fault this whole round keeps finding.
     *
     * So: find the nearest slot to `near` that suits the place and has nothing on it, and build the
     * mouth there. Returns the site, or null if this world has nowhere that fits — which is a real
     * answer, and the caller must not promise a place it could not put down.
     */
    placeInstance(id, near = null, { maxAway = 4000 } = {}) {
      const spec = (instanceData?.instances || []).find(i => i.id === id);
      if (!spec || !setpieces?.layouts?.[spec.plan]) return null;
      const already = sites.find(s => s.family === 'instance' && s.type === id);
      if (already) return already;
      const from = near || (lastPoint ? { x: lastPoint[0], z: lastPoint[1] } : { x: 0, z: 0 });
      const taken = new Set(sites.map(s => String(s.key)));
      let best = null, bestD = maxAway;
      for (const slot of slotsFrom(terrain.world)) {
        if (taken.has(String(slot.key))) continue;
        if (terrain.underwater?.(slot.x, slot.z)) continue;
        const d = Math.hypot(slot.x - from.x, slot.z - from.z);
        if (d >= bestD) continue;
        const tags = tagsFor(slot);
        if (!(spec.on || []).some(t => tags.has(t))) continue;
        if (townGap(slot.x, slot.z) <= (spec.townGap ?? 200)) continue;
        bestD = d; best = slot;
      }
      if (!best) return null;
      const zone = zones?.at(best.x, best.z) || null;
      const site = {
        id: best.id, key: best.key,
        kind: 'instance', type: spec.id, family: 'instance', plan: spec.plan, spec,
        instance: spec,
        name: spec.name, blurb: spec.blurb, does: 'Go in.',
        gives: spec.gives || {}, faction: null, hostile: false,
        tier: 0, arch: spec.arch || 'stone',
        x: best.x, z: best.z, cell: best.cell, zone,
        level: Math.max(1, (zone?.midLevel ?? 1) + (spec.interior?.overLevel ?? 0)),
        pin: { color: '#b090ff', r: 3.6, glyph: spec.icon || 'dungeon' },
        populated: false, cleared: false, fromQuest: true,
      };
      sites.push(site);
      lastCentre = null;
      if (lastPoint) update(lastPoint[0], lastPoint[1], true);
      return site;
    },

    /**
     * R16 — A CONSUMED LANDMARK STOPS ADVERTISING ITSELF.
     *
     *   "This event is not significant enough to warrant a global indicator and once consumed it
     *    should have just gone away."
     *
     * The set piece stays standing — a gibbet does not vanish because you read what was in it —
     * but its map pin goes, which is the thing that was making a twenty-experience curiosity look
     * like somewhere you had to go.
     */
    markTaken(key) {
      const s = sites.find(v => String(v.key) === String(key));
      if (s) { s.taken = true; s.pin = null; }
      return s || null;
    },

    /**
     * R16 — THE GIBBET WITH NO MODEL.
     *
     *   "Also, despite the name 'gibbet cage' there was no model there."
     *
     * `js/territory.js` invents a handful of landmarks per zone out of the same JSON this file
     * reads, at its own coordinates, and builds NO geometry for any of them. This file builds the
     * set pieces you can see, and the two were never introduced — so half the landmarks in the
     * game were a prompt over empty grass, and the other half were models whose reward never paid
     * because the id namespaces do not match (`l3_0` against `9012`).
     *
     * This reconciles them, in the one direction that cannot produce a duplicate:
     *
     *   * A territory mark that lands near a set piece ADOPTS it — the mark takes the set piece's
     *     kind, name, blurb, gives and exact coordinates, so what you read and what you are
     *     standing in front of are the same place. Nothing is built twice.
     *   * A territory mark with nothing near it gets a set piece built FOR it, at its own spot,
     *     from `data/setpieces.json` — the same layout the wild ones use.
     *
     * Returns the marks it touched, so the caller can see the join happened.
     */
    claimLandmarks(marks = [], { snap = 90 } = {}) {
      if (!marks.length || !setpieces) return [];
      const built = sites.filter(s => s.family === 'landmark');
      const touched = [];
      let fresh = 0;
      for (const mark of marks) {
        if (!mark || mark.siteKey) continue;
        let near = null, nearD = snap;
        for (const s of built) {
          if (s.territoryId) continue;                      // one set piece, one record
          const d = Math.hypot(s.x - mark.x, s.z - mark.z);
          if (d < nearD) { nearD = d; near = s; }
        }
        if (near) {
          // The set piece wins on everything you can SEE, because it is the thing standing there.
          near.territoryId = mark.id;
          mark.siteKey = String(near.key);
          mark.kind = near.type; mark.name = near.name;
          mark.blurb = near.blurb; mark.does = near.does;
          mark.gives = near.gives || mark.gives || {};
          mark.steps = near.steps || 0;
          mark.x = near.x; mark.z = near.z; mark.cell = near.cell || mark.cell;
          if (mark.taken) { near.taken = true; near.pin = null; }
          touched.push(mark);
          continue;
        }
        // Nothing near it: build one where the territory says it is.
        const layout = setpieces?.layouts?.[mark.kind];
        if (!layout) continue;
        /**
         * R21 — AND NOT ON TOP OF A TOWN.
         *
         * `buildSites` has asked `townGap` since round 16; this path never did, so a landmark the
         * territory layer invented could be built anywhere — including the exact centre of a
         * settlement, which is what the play-test walked into. `js/territory.js` no longer offers a
         * settlement node as a spot, and this is the belt to that braces: a zone's cells can still
         * fall inside a town's ring, and a set piece with its own approach avenue has no business
         * in a market square. `nudgeClear` walks it out to open ground rather than dropping the
         * landmark entirely, so a zone keeps the number of places it is supposed to have.
         */
        const clear = nudgeClear(mark.x, mark.z, 200);
        if (!clear) continue;
        mark.x = clear[0]; mark.z = clear[1];
        const key = `tl${mark.id}`;
        if (sites.some(s => s.key === key)) continue;
        const spec = (landmarkData?.landmarks || []).find(l => l.kind === mark.kind) || null;
        const site = {
          id: 30000 + (fresh++),
          key, kind: 'landmark', type: mark.kind, family: 'landmark', plan: mark.kind,
          spec, territoryId: mark.id,
          name: mark.name, blurb: mark.blurb, does: mark.does,
          gives: mark.gives || {}, faction: mark.faction || null,
          steps: mark.steps || 0, done: mark.done || 0,
          tier: 0, hostile: false,
          x: mark.x, z: mark.z, cell: mark.cell || null, zone: null, level: 1,
          pin: mark.taken ? null : { color: '#8fd0ff', r: 3, glyph: (spec && spec.icon) || 'shrine' },
          taken: !!mark.taken,
          populated: false, cleared: false,
        };
        sites.push(site);
        built.push(site);
        mark.siteKey = key;
        touched.push(mark);
      }
      if (touched.length) { lastCentre = null; if (lastPoint) update(lastPoint[0], lastPoint[1], true); }
      return touched;
    },
    lights: () => fires.map(f => ({
      x: f.x, y: f.y, z: f.z,
      color: balance.light?.brazier?.color || '#ff9040',
      range: balance.light?.brazier?.range ?? 26,
      intensity: balance.light?.brazier?.intensity ?? 2.4,
    })),
    stats: () => ({
      sites: sites.length, shown: shown.length,
      camps: sites.filter(s => s.kind === 'camp').length,
      lairs: sites.filter(s => s.kind === 'lair').length,
      landmarks: sites.filter(s => s.family === 'landmark').length,
      worldBosses: sites.filter(s => s.family === 'worldboss').length,
      bossesUp: waves.length,
      caches: sites.filter(s => s.cacheChest).length,
      pieces: PIECE_KEYS.reduce((n, k) => n + meshes[k].count, 0),
    }),
    dispose() {
      for (const key of PIECE_KEYS) { const m = meshes[key]; scene.remove(m); m.geometry.dispose(); m.material.dispose(); m.dispose(); }
      scene.remove(fireMesh); fireMesh.geometry.dispose(); fireMesh.material.dispose(); fireMesh.dispose();
    },
  };
  return api;
}
