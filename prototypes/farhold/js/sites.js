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
//   const sites = createSites(scene, terrain, { seed, balance, zones, collide });
//   sites.update(px, pz);                      // builds the set pieces near you
//   for (const s of sites.due(px, pz)) …       // hostile sites close enough to fill with bodies
//   await sites.populate(site, { field, chests, nameFor });   // garrison + named boss + the chest
//
// The three JSON files are fetched by this module at IMPORT, not handed in, so nothing outside this
// file had to change to get the places built — and by the time `createSites` is reached (main.js
// grows a star, a system, a planet and a whole terrain first) they are long since back, so the site
// list is built there and then. `sites.ready` is there for anyone who needs to be sure.

import * as THREE from 'three';
import { makeRng } from '../../../worldgen/js/noise.js';
import { BIOMES } from '../../../worldgen/js/biomes.js';
import { brazierBody } from './chests.js';
import { M_PER_CELL } from './planet.js';

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

  /** A proper standing stone — eight metres, not the five the ordinary props scatter. */
  menhir: { tall: 8.2, cap: 70, solid: [0.9, 8], build: (stone = '#6a6459') => mergeParts([
    { geometry: BOX, color: stone, matrix: at(0, 3.8, 0, 1.35, 7.4, 0.85) },
    { geometry: BOX, color: stone, matrix: at(0.1, 7.6, 0, 1.1, 0.7, 0.75, 0.12) },
    { geometry: BOX, color: '#4e4941', matrix: at(0, 0.24, 0, 2.2, 0.48, 1.7) },
  ]) },

  /** Fifteen metres of stepped base and tapering shaft. This is the "visible from the ridge" piece. */
  obelisk: { tall: 15.2, cap: 16, solid: [1.6, 15], build: (stone = '#948b7c') => mergeParts([
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
  gatehouse: { tall: 11.5, cap: 14, solid: [5.4, 11], build: (stone = '#8a8275') => mergeParts([
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
  den: { tall: 6.4, cap: 16, solid: [3.6, 5], build: (earth = '#5b4c3a', rock = '#6e675c') => mergeParts([
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
const grab = name => fetch(new URL(`../data/${name}.json`, import.meta.url)).then(r => r.json());
const SITE_DATA = Promise.all([grab('strongholds'), grab('setpieces'), grab('landmarks')])
  .then(([strongholds, setpieces, landmarks]) => { CACHE = { strongholds, setpieces, landmarks }; return CACHE; })
  .catch(() => null);     // no places this run; the rest of the world still stands

// ---------------------------------------------------------------------------- the sites

export function createSites(scene, terrain, { seed = 1, balance = {}, zones = null, collide = null, radius = 2600, data = null } = {}) {
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
  let sites = [];
  let shown = [];
  let lastPoint = null;

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
    .map(n => ({ x: n.x * cell, z: n.y * cell, guard: 190 + (n.size ?? 1) * 120 }));

  // The warm path — the cache is already full, so there is no wait and no empty first frame.
  let ready = Promise.resolve(null);
  if (strongholds && setpieces && landmarkData) {
    sites = buildSites();
  } else {
    // …and the cold one, for a page that reached here before the three files came back.
    ready = SITE_DATA.then(d => {
      if (!d) return null;
      strongholds = d.strongholds; setpieces = d.setpieces; landmarkData = d.landmarks;
      sites = buildSites();
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
      const d = Math.hypot(t.x - x, t.z - z) - t.guard;
      if (d < best) best = d;
    }
    return best;
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
    const out = [];
    for (const slot of slotsFrom(terrain.world)) {
      // A road cell can sit on a ford, and a landmark node can sit a metre above the tide line. A
      // castle with its courtyard under water is not a castle, so the wet slots are simply dropped.
      if (terrain.underwater?.(slot.x, slot.z)) continue;
      const zone = zones?.at(slot.x, slot.z) || null;
      const band = zone?.band ?? 1;
      const rng = makeRng((seed ^ (slot.id * 2654435761)) >>> 0);
      const tags = tagsFor(slot);

      const gap = townGap(slot.x, slot.z);
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
      const solid = PIECES[piece].solid;
      if (solid && collide) collide.add(wx, wz, solid[0] * scale, solid[1] * scale);
    };

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

    // THE APPROACH. This is the difference between a set piece and a pile: markers that start sixty
    // metres out and walk you in, so you know you have arrived somewhere before you get there.
    const app = layout.approach;
    if (app) {
      const heading = rng() * Math.PI * 2;
      const side = heading + Math.PI / 2;
      for (let i = 0; i < (app.count || 0); i++) {
        const t = app.count === 1 ? 0 : i / (app.count - 1);
        const d = (app.from ?? 50) + t * ((app.to ?? 18) - (app.from ?? 50));
        const lanes = app.both ? [-1, 1] : [0];
        for (const lane of lanes) {
          const off = lane * (app.spread ?? 3);
          const x = cx + Math.cos(heading) * d + Math.cos(side) * off;
          const z = cz + Math.sin(heading) * d + Math.sin(side) * off;
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
      buildLayout(s, counts, i < FULL);
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
    const spec = site.spec;
    const lvl = level ?? site.level ?? 1;
    const rng = field.rng;

    if (!site.hostile || !spec?.garrison) return out;

    const all = field.defsFor(site.x, site.z, lvl);
    if (!all.length) return out;
    const want = spec.garrison.prefer || {};
    const narrowed = all.filter(d =>
      (!want.families || want.families.includes(d.family)) &&
      (!want.roles || want.roles.includes(d.role)));
    const pool = narrowed.length ? narrowed : all;

    // the boss first, in the middle of it
    const bossSpec = spec.boss || {};
    if (bossSpec.rank === 'boss') {
      const def = field.bossFor(lvl, site.x, site.z);
      if (def) out.boss = await field.placeBoss(def, lvl, site.x, site.z);
    } else {
      const leaders = pool.filter(d => d.role === 'leader');
      const def = rng.pick(leaders.length ? leaders : pool);
      const modifiers = field.rpg.pickModifiers(field.modifiers, bossSpec.modifiers ?? 1, rng);
      out.boss = await field.add(def, lvl, site.x, site.z, {
        rank: bossSpec.rank || 'champion', modifiers, name: bossName(site, def, nameFor, rng),
      });
    }
    if (out.boss) out.boss.siteKey = site.key;

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
    if (chests && spec.chest?.kind) {
      const a = rng() * Math.PI * 2, r = 3 + (spec.tier || 1);
      out.chest = chests.place(spec.chest.kind, site.x + Math.cos(a) * r, site.z + Math.sin(a) * r,
        { level: lvl, facing: rng() * Math.PI * 2, name: `${site.name}: the Strongbox` });
    }
    out.prisoners = site.gives?.prisoners || 0;
    return out;
  }

  /** `<a Name Forge given name> <epithet>`, or something that still reads as a name without one. */
  function bossName(site, def, nameFor, rng) {
    const list = site.spec?.boss?.epithets || [];
    const epithet = list.length ? list[Math.floor(rng() * list.length) % list.length] : 'the Held Ground';
    const given = nameFor ? nameFor(def, rng) : null;
    return given ? `${given} ${epithet}` : `${cap(epithet.replace(/^(the|who|of) /, ''))} of ${site.name}`;
  }

  /** Sites close enough to fill with bodies, and not filled yet. Each comes back once. */
  function due(px, pz, range = 150) {
    const out = [];
    for (const s of shown) {
      if (!s.hostile || s.populated || s.cleared) continue;
      if (Math.hypot(s.x - px, s.z - pz) > range) continue;
      s.populated = true;
      out.push(s);
    }
    return out;
  }

  /** Walking far enough away lets a site be filled again, so the world is not used up. */
  function relax(px, pz, range = 420) {
    for (const s of sites) {
      if (s.populated && !s.cleared && Math.hypot(s.x - px, s.z - pz) > range) s.populated = false;
    }
  }

  return {
    get sites() { return sites; },
    /** Resolves once the three data files are in and the site list is built. */
    ready,
    update, due, relax, populate,
    get visible() { return shown; },
    /** The nearest place you are standing in, whether it fights back or not. */
    nearest: (x, z, range = 40) => {
      let best = null, bestD = range;
      for (const s of shown) { const d = Math.hypot(s.x - x, s.z - z); if (d < bestD) { bestD = d; best = s; } }
      return best;
    },
    /** Mark one cleared, so it stops refilling. */
    clear(key) { const s = sites.find(v => v.key === key); if (s) { s.cleared = true; s.populated = true; } return s || null; },
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
      pieces: PIECE_KEYS.reduce((n, k) => n + meshes[k].count, 0),
    }),
    dispose() {
      for (const key of PIECE_KEYS) { const m = meshes[key]; scene.remove(m); m.geometry.dispose(); m.material.dispose(); m.dispose(); }
      scene.remove(fireMesh); fireMesh.geometry.dispose(); fireMesh.material.dispose(); fireMesh.dispose();
    },
  };
}
