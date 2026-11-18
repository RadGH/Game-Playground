// Workshop & industrial props (Overdrive Frame round 0): the everyday machines and people that sell the size of a
// giant mech — its title scene is a mech being serviced in a huge workshop, with a forklift and a semi truck at its
// feet — and the pieces of the hangar hub.
//
// TRUE TO SCALE (prototypes/overdrive-frame/docs/ARCH.md, binding): 1 unit = 1 tile = 16 m, so 1 m = 1/16 unit (M).
// A mech is ≈ 0.75 units (12 m). Semi truck ≈ 1.0 × 0.16 × 0.25 units (16 m long, 2.55 m wide, 4 m tall); forklift
// ≈ 0.2 units tall with the forks up; a crew figure ≈ 0.11 units (1.8 m). citykit/tests/workshop.spec.js measures them.
//
// Things that face a way (forklift, truck, pallet jack, crew) follow the `dirs` contract: model forward is +x and
// userData.face(heading) turns it. Everything that should show at night uses a glow material (headlights, beacons,
// work lights, reflective tape). These props are tiny on a tile, so they bake at a bigger scale (`bakeScale`).
import * as THREE from 'three';
import { addRecipes, GROUPS } from './buildings.js';
import { box, bodyMat, neonMat } from './shapes.js';
import { rng } from './rng.js';

if (!GROUPS.some(g => g.id === 'workshop')) GROUPS.push({ id: 'workshop', label: 'Workshop & industrial' });

export const M = 1 / 16;   // one metre in tile units

// ---------------------------------------------------------------- helpers
const geo = new Map();
const G = (k, make) => { if (!geo.has(k)) geo.set(k, make()); return geo.get(k); };
const f4 = n => n.toFixed(4);
const mat = (color, metal = 0.35, rough = 0.6) => bodyMat('chrome', 0, { color, metal, rough });
function add(parent, g, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; }
/** Box in metres: w (x) × h × d (z), bottom at y. */
const bx = (p, w, h, d, m, x = 0, y = 0, z = 0) => box(p, w * M, h * M, d * M, m, x * M, y * M, z * M);
/** Cylinder in metres standing up, bottom at y. */
function cy(p, r, h, m, x = 0, y = 0, z = 0, { rt = r, seg = 12 } = {}) {
  return add(p, G(`c${f4(r * M)}:${f4(rt * M)}:${f4(h * M)}:${seg}`, () => new THREE.CylinderGeometry(rt * M, r * M, h * M, seg)), m, x * M, (y + h / 2) * M, z * M);
}
/** Wheel (metres): axis along z, centre at (x, r, z). */
function wheel(p, r, w, x, z, m = mat('#1c1e22', 0.1, 0.9)) { const o = cy(p, r, w, m, x, 0, z, { seg: 14 }); o.rotation.x = Math.PI / 2; o.position.set(x * M, r * M, z * M); return o; }
/** A round rod between two points (metres). */
function rod(p, a, b, r, m, seg = 6) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length();
  const o = add(p, G(`r${f4(r * M)}:${f4(L * M)}:${seg}`, () => new THREE.CylinderGeometry(r * M, r * M, L * M, seg)), m, (a[0] + b[0]) / 2 * M, (a[1] + b[1]) / 2 * M, (a[2] + b[2]) / 2 * M);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return o;
}
function ball(p, r, m, x, y, z, seg = 10) { return add(p, G(`s${f4(r * M)}:${seg}`, () => new THREE.SphereGeometry(r * M, seg, Math.ceil(seg * 0.7))), m, x * M, y * M, z * M); }
/** The facing contract: an inner group the face() hook turns (forward = +x). */
function facing(build) {
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  build(inner);
  g.userData.face = heading => { inner.rotation.y = -heading; };
  return g;
}

const STEEL = '#8a949f', DARK = '#33383f', TIRE = '#1c1e22', HAZARD = '#e3b52c', RUBBER = '#26282c';
const PAINTS = [['Hazard yellow', '#e3b52c'], ['Safety orange', '#e8742a'], ['Signal red', '#c8332b'], ['Fleet blue', '#2f6fb3'], ['Works green', '#3f8a4a'], ['Graphite', '#454b54'], ['White', '#e4e7ea']];
const paintNames = PAINTS.map(p => p[0]);
const HEAD = () => neonMat('#fff4d8', 0.35), AMBER = () => neonMat('#ffa020', 0.7), REDL = () => neonMat('#ff3020', 0.45), GREEN = () => neonMat('#5dff6a', 0.6);
const TAPE = () => neonMat('#e8ff9a', 0.06);   // reflective tape: catches the work lights at night

// ---------------------------------------------------------------- crew figure (also used by the welding platform)
const COVERALLS = [['Orange', '#d8682a'], ['Navy', '#2c3e66'], ['Grey', '#6c737c'], ['Green', '#3e6a44'], ['Red', '#a8322c']];
const POSES = ['Stand', 'Point', 'Weld', 'Carry'];
/** A 1.8 m worker in coveralls and a hard hat, facing +x. Simple shapes, no face. pose: 0..3. */
export function crewFigure(parent, { suit = '#d8682a', pose = 0, x = 0, y = 0, z = 0 } = {}) {
  const g = new THREE.Group(); g.position.set(x * M, y * M, z * M); parent.add(g);
  const cloth = mat(suit, 0.05, 0.85), skin = mat('#b98a6a', 0, 0.8), boot = mat('#2a2522', 0.1, 0.8), hat = mat('#f2c230', 0.2, 0.45);
  const crouch = pose === 2 ? 0.35 : 0;
  // legs
  for (const s of [-1, 1]) {
    if (crouch) { rod(g, [0, 0.45, s * 0.12], [0.3, 0.5, s * 0.12], 0.075, cloth); rod(g, [0.3, 0.5, s * 0.12], [0.25, 0.05, s * 0.12], 0.07, cloth); bx(g, 0.26, 0.1, 0.12, boot, 0.3, 0, s * 0.12); }
    else { rod(g, [0, 0.92, s * 0.11], [0, 0.08, s * 0.11], 0.075, cloth); bx(g, 0.26, 0.1, 0.12, boot, 0.05, 0, s * 0.11); }
  }
  const hip = 0.88 - crouch;
  bx(g, 0.24, 0.62, 0.42, cloth, 0, hip, 0);                        // torso
  bx(g, 0.245, 0.05, 0.43, TAPE(), 0, hip + 0.2, 0);                // reflective band
  ball(g, 0.11, skin, 0.01, hip + 0.76, 0);                         // head (no face)
  const dome = ball(g, 0.125, hat, 0.01, hip + 0.8, 0); dome.scale.y = 0.75;
  cy(g, 0.15, 0.02, hat, 0.03, hip + 0.78, 0);                      // brim
  const sh = hip + 0.58;
  const arm = (s, hand) => { rod(g, [0, sh, s * 0.25], hand, 0.055, cloth); ball(g, 0.05, skin, hand[0], hand[1], hand[2], 6); };
  if (pose === 1) { arm(-1, [0.05, sh - 0.55, -0.27]); arm(1, [0.6, sh + 0.25, 0.32]); }                    // pointing ahead and up
  else if (pose === 2) {                                                                                     // welding: torch forward
    arm(-1, [0.42, sh - 0.2, -0.1]); arm(1, [0.45, sh - 0.18, 0.12]);
    rod(g, [0.45, sh - 0.18, 0.1], [0.62, sh - 0.3, 0.05], 0.02, mat(DARK));
    ball(g, 0.05, neonMat('#bfe8ff', 1), 0.65, sh - 0.33, 0.05, 6);
    bx(g, 0.05, 0.2, 0.24, mat('#2a2e33', 0.3, 0.5), 0.13, hip + 0.66, 0);                                // visor
  } else if (pose === 3) {                                                                                   // carrying a box
    arm(-1, [0.35, sh - 0.3, -0.2]); arm(1, [0.35, sh - 0.3, 0.2]);
    bx(g, 0.4, 0.3, 0.42, mat('#a07a4a', 0, 0.85), 0.42, sh - 0.42, 0);
  } else { arm(-1, [0, sh - 0.58, -0.27]); arm(1, [0, sh - 0.58, 0.27]); }
  return g;
}

// ---------------------------------------------------------------- recipes
addRecipes({
  'ws-forklift': {
    name: 'Forklift', group: 'workshop', genre: ['industrial'], noStyle: true, dirs: 8, bakeScale: 8,
    blurb: 'A 3-tonne counterbalance forklift: 1.2 m wide, 3.3 m long with forks, mast 2.3 m (3.4 m with the forks up).',
    params: [{ key: 'forks', label: 'Forks', min: 0, max: 1, step: 1, def: 0, names: ['Down', 'Up'] },
      { key: 'paint', label: 'Paint', min: 0, max: PAINTS.length - 1, step: 1, def: 0, names: paintNames }],
    build(p) {
      return facing(g => {
        const body = mat(PAINTS[p.paint][1], 0.3, 0.55), dark = mat(DARK, 0.4, 0.5), steel = mat(STEEL, 0.6, 0.4);
        // chassis (rear counterweight at −x), wheels
        bx(g, 1.9, 0.6, 1.1, body, -0.15, 0.25, 0);
        bx(g, 0.6, 0.75, 1.15, body, -0.95, 0.25, 0);                        // counterweight
        bx(g, 0.5, 0.3, 1.0, dark, -0.4, 0.85, 0);                           // seat base
        bx(g, 0.1, 0.5, 0.5, dark, -0.62, 1.1, 0);                           // seat back
        rod(g, [0.15, 0.95, 0], [0.05, 1.35, 0], 0.03, dark);                 // steering column
        for (const s of [-1, 1]) { wheel(g, 0.33, 0.25, 0.45, s * 0.5); wheel(g, 0.28, 0.22, -0.85, s * 0.48); }
        // overhead guard
        for (const [x, s] of [[0.35, -1], [0.35, 1], [-0.85, -1], [-0.85, 1]]) rod(g, [x, 0.85, s * 0.52], [x - (x > 0 ? 0.05 : 0), 2.15, s * 0.52], 0.035, dark);
        bx(g, 1.35, 0.06, 1.1, dark, -0.27, 2.15, 0);
        for (let i = 0; i < 4; i++) bx(g, 1.3, 0.04, 0.04, steel, -0.27, 2.21, -0.4 + i * 0.27);
        bx(g, 0.12, 0.08, 0.12, AMBER(), -0.75, 2.21, 0);                      // beacon
        // mast + carriage + forks
        const up = p.forks ? 1.9 : 0.05;
        for (const s of [-1, 1]) bx(g, 0.08, 2.3, 0.1, steel, 0.68, 0.05, s * 0.32);
        if (p.forks) for (const s of [-1, 1]) bx(g, 0.07, 2.2, 0.08, steel, 0.74, 1.15, s * 0.26);   // inner mast raised
        bx(g, 0.08, 0.06, 0.74, steel, 0.68, 2.3, 0);
        bx(g, 0.08, 0.95, 0.9, dark, 0.78, up, 0);                           // carriage + backrest
        for (const s of [-1, 1]) bx(g, 1.1, 0.05, 0.12, steel, 1.35, up, s * 0.3);
        if (p.forks) for (const s of [-1, 1]) rod(g, [0.78, up, s * 0.3], [0.7, 0.3, s * 0.3], 0.015, mat('#2a2a2a'));   // lift chains
        for (const s of [-1, 1]) bx(g, 0.05, 0.1, 0.14, HEAD(), 0.62, 1.95, s * 0.48);      // work lights on the guard
        bx(g, 0.04, 0.08, 0.16, REDL(), -1.26, 0.7, 0);                                    // tail light
      });
    },
  },
  'ws-semi': {
    name: 'Semi Truck', group: 'workshop', genre: ['industrial'], noStyle: true, dirs: 8, bakeScale: 4,
    blurb: 'Tractor + trailer, 16 m long, 2.55 m wide, 4 m tall: box van, flatbed with a crate load, or tanker.',
    params: [{ key: 'cab', label: 'Cab colour', min: 0, max: PAINTS.length - 1, step: 1, def: 3, names: paintNames },
      { key: 'trailer', label: 'Trailer', min: 0, max: 2, step: 1, def: 0, names: ['Box van', 'Flatbed', 'Tanker'] }],
    build(p) {
      return facing(g => {
        const cab = mat(PAINTS[p.cab][1], 0.45, 0.4), chrome = mat('#c9cfd6', 0.85, 0.25), dark = mat(DARK, 0.4, 0.55), glass = mat('#24384a', 0.7, 0.15);
        // tractor: front at x = +8 m. Chassis rails, cab, hood, sleeper.
        bx(g, 6.4, 0.35, 1.0, dark, 4.6, 0.75, 0);
        bx(g, 1.6, 1.2, 2.3, cab, 7.1, 0.95, 0);                             // hood
        bx(g, 0.12, 0.9, 1.5, chrome, 7.95, 1.0, 0);                          // grille
        bx(g, 2.2, 2.0, 2.5, cab, 5.2, 1.05, 0);                              // cab
        bx(g, 0.06, 0.9, 2.2, glass, 6.32, 2.0, 0);                           // windscreen
        for (const s of [-1, 1]) bx(g, 1.2, 0.7, 0.04, glass, 5.5, 2.1, s * 1.25);   // side windows
        bx(g, 1.4, 2.5, 2.5, cab, 3.45, 1.05, 0);                             // sleeper
        bx(g, 1.2, 0.4, 2.4, cab, 3.5, 3.55, 0);                              // roof fairing
        for (const s of [-1, 1]) { cy(g, 0.09, 2.6, chrome, 4.1, 1.5, s * 1.15); cy(g, 0.3, 1.0, chrome, 4.5, 0.55, s * 1.0); }   // stacks, tanks
        bx(g, 0.2, 0.25, 2.5, chrome, 7.95, 0.55, 0);                         // bumper
        for (const s of [-1, 1]) { bx(g, 0.06, 0.2, 0.45, HEAD(), 7.98, 0.95, s * 0.85); bx(g, 0.1, 0.1, 0.1, AMBER(), 6.3, 3.0, s * 1.0); }
        for (const s of [-1, 1]) { wheel(g, 0.52, 0.32, 6.9, s * 1.1); wheel(g, 0.52, 0.55, 3.6, s * 0.95); wheel(g, 0.52, 0.55, 2.3, s * 0.95); }
        bx(g, 1.2, 0.15, 1.6, dark, 2.9, 1.1, 0);                             // fifth wheel
        // trailer: 12 m from x = −8 to +4 (its nose over the fifth wheel)
        const x0 = -8, x1 = 4, cx = (x0 + x1) / 2, L = x1 - x0;
        for (const s of [-1, 1]) { wheel(g, 0.52, 0.55, -6.9, s * 0.95); wheel(g, 0.52, 0.55, -5.6, s * 0.95); }
        bx(g, 0.1, 1.0, 0.1, dark, 1.0, 0.25, -1.0); bx(g, 0.1, 1.0, 0.1, dark, 1.0, 0.25, 1.0);   // landing legs
        if (p.trailer === 0) {
          const van = mat('#dfe3e8', 0.3, 0.5);
          bx(g, L, 2.7, 2.55, van, cx, 1.3, 0);
          for (let i = 0; i <= 12; i++) bx(g, 0.06, 2.7, 2.58, mat('#c4c9cf', 0.4, 0.5), x0 + i * L / 12, 1.3, 0);   // side ribs
          bx(g, L, 0.25, 2.6, mat('#2f6fb3', 0.3, 0.5), cx, 1.6, 0);                                              // fleet stripe
          for (const s of [-1, 1]) for (const x of [x0 + 0.2, x1 - 0.2]) bx(g, 0.1, 0.1, 0.1, AMBER(), x, 4.0, s * 1.2);
        } else if (p.trailer === 1) {
          bx(g, L, 0.35, 2.55, mat('#4a5058', 0.5, 0.5), cx, 1.15, 0);
          bx(g, 2.4, 2.4, 2.3, mat('#8a6a45', 0, 0.85), -4.5, 1.5, 0);                                           // crate load
          bx(g, 3.6, 1.6, 2.2, mat('#5d6b78', 0.5, 0.45), 0.6, 1.5, 0);                                           // machine part
          for (const x of [-4.5, 0.6]) rod(g, [x, 4.0, -1.27], [x, 4.0, 1.27], 0.03, mat(HAZARD, 0.1, 0.6));      // straps
          for (const s of [-1, 1]) for (const x of [x0 + 0.2, x1 - 0.2]) bx(g, 0.1, 0.1, 0.1, AMBER(), x, 1.5, s * 1.28);
        } else {
          bx(g, L, 0.3, 1.4, dark, cx, 0.95, 0);
          const tank = cy(g, 1.15, L - 0.6, chrome, cx, 2.35 - (L - 0.6) / 2, 0, { seg: 20 }); tank.rotation.z = Math.PI / 2; tank.position.y = 2.35 * M;
          for (let i = 0; i < 3; i++) cy(g, 0.35, 0.2, chrome, cx - 4 + i * 4, 3.45, 0);                       // hatches
          bx(g, L - 1, 0.1, 0.6, mat('#6c737c', 0.6, 0.4), cx, 3.5, 0);                                          // catwalk
          for (const s of [-1, 1]) bx(g, 0.1, 0.1, 0.1, AMBER(), x0 + 0.4, 2.4, s * 1.18);
        }
        for (const s of [-1, 1]) bx(g, 0.06, 0.18, 0.35, REDL(), x0 - 0.02, 0.9, s * 1.0);                     // tail lights
      });
    },
  },
  'ws-gantry': {
    name: 'Gantry Crane', group: 'workshop', genre: ['industrial'], noStyle: true, size: [2, 1], bakeScale: 4,
    blurb: 'An overhead crane on two rail legs, 16 m high: span from 16 to 30 m, the hook block on its cables at any height.',
    params: [{ key: 'span', label: 'Span', min: 16, max: 30, step: 2, def: 24, unit: 'm' }, { key: 'hook', label: 'Hook height', min: 2, max: 14, step: 1, def: 8, unit: 'm' }],
    build(p) {
      const g = new THREE.Group();
      const yel = mat(HAZARD, 0.35, 0.5), dark = mat(DARK, 0.5, 0.5), steel = mat(STEEL, 0.6, 0.4);
      const half = p.span / 2, H = 16, zr = 6.5;
      bx(g, 31.4, 0.08, 15.4, mat('#5a5e64', 0.1, 0.9), 0, 0, 0);               // the yard floor under it
      for (const s of [-1, 1]) {
        const x = s * half;
        bx(g, 0.6, 0.3, zr * 2 + 1, dark, x, 0, 0);                            // ground rail
        for (const z of [-zr, zr]) { bx(g, 1.2, 0.8, 1.6, dark, x, 0.3, z); bx(g, 0.7, H - 1.1, 0.7, yel, x, 1.1, z); }
        bx(g, 0.8, 1.0, zr * 2 + 0.7, yel, x, H - 1, 0);                       // top girder along the rail
        rod(g, [x, 1.5, -zr], [x, H - 1.2, zr * 0.2], 0.12, yel); rod(g, [x, 1.5, zr], [x, H - 1.2, -zr * 0.2], 0.12, yel);   // bracing
      }
      for (const z of [-1.2, 1.2]) bx(g, p.span + 0.6, 1.4, 0.6, yel, 0, H - 0.4, z);   // twin bridge girders
      for (let i = 0; i <= 8; i++) bx(g, 0.12, 1.2, 2.4, dark, -half + i * p.span / 8, H - 0.3, 0);
      // trolley + hoist
      const tx = half * 0.25;
      bx(g, 3, 1.4, 3.4, dark, tx, H + 1.0, 0);
      bx(g, 0.3, 0.3, 0.3, AMBER(), tx + 1.2, H + 2.4, 1.3);
      const hy = Math.min(p.hook, H - 2.5);
      for (const z of [-0.35, 0.35]) rod(g, [tx, H - 0.4, z], [tx, hy + 1.6, z], 0.05, steel);
      bx(g, 1.2, 1.2, 1.0, yel, tx, hy + 0.5, 0);                                // hook block
      const hook = add(g, G('hook', () => new THREE.TorusGeometry(0.35 * M, 0.1 * M, 6, 12, Math.PI * 1.4)), steel, tx * M, (hy + 0.15) * M, 0); hook.rotation.z = Math.PI * 0.8;
      for (let i = 0; i < 3; i++) bx(g, 0.8, 0.12, 0.5, HEAD(), -half * 0.6 + i * half * 0.6, H - 0.55, 0);   // work lights under the bridge
      return g;
    },
  },
  'ws-scaffold': {
    name: 'Scaffolding Tower', group: 'workshop', genre: ['industrial'], noStyle: true, size: [1, 1], bakeScale: 8,
    blurb: 'Tube-and-board scaffolding, 2.5 × 1.5 m, 2 m a level, with ladder, braces and a clamp-on work light on top.',
    params: [{ key: 'levels', label: 'Levels', min: 1, max: 8, step: 1, def: 4 }],
    build(p) {
      const g = new THREE.Group();
      const tube = mat('#b8bec6', 0.7, 0.35), board = mat('#a07a4a', 0, 0.85), toe = mat(HAZARD, 0.1, 0.6);
      const W = 2.5, D = 1.5, Lh = 2, top = p.levels * Lh;
      for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) { rod(g, [x, 0, z], [x, top + 1, z], 0.05, tube); bx(g, 0.2, 0.05, 0.2, tube, x, 0, z); }
      for (let l = 1; l <= p.levels; l++) {
        const y = l * Lh;
        for (const z of [-D / 2, D / 2]) { rod(g, [-W / 2, y, z], [W / 2, y, z], 0.04, tube); rod(g, [-W / 2, y + 1, z], [W / 2, y + 1, z], 0.04, tube); }
        for (const x of [-W / 2, W / 2]) rod(g, [x, y, -D / 2], [x, y, D / 2], 0.04, tube);
        rod(g, [-W / 2, y - Lh, (l % 2 ? -1 : 1) * D / 2], [W / 2, y, (l % 2 ? -1 : 1) * D / 2], 0.035, tube);   // brace
        bx(g, W - 0.1, 0.05, D - 0.1, board, 0, y, 0);
        bx(g, W, 0.15, 0.03, toe, 0, y + 0.05, D / 2);
      }
      for (let y = 0.3; y < top; y += 0.3) rod(g, [W / 2 + 0.05, y, -0.2], [W / 2 + 0.05, y, 0.2], 0.02, tube);   // ladder rungs
      for (const z of [-0.2, 0.2]) rod(g, [W / 2 + 0.05, 0, z], [W / 2 + 0.05, top + 1, z], 0.03, tube);
      bx(g, 0.3, 0.25, 0.2, mat(DARK), -W / 2 + 0.2, top + 1, 0); bx(g, 0.04, 0.2, 0.18, HEAD(), -W / 2 + 0.37, top + 1.02, 0);
      bx(g, 0.1, 0.1, 0.1, REDL(), W / 2, top + 1.05, D / 2);
      return g;
    },
  },
  'ws-cradle': {
    name: 'Mech Maintenance Cradle', group: 'workshop', genre: ['industrial'], noStyle: true, size: [1, 1], bakeScale: 4,
    blurb: 'The frame a 12 m mech stands in for service: 14 m columns, walkways round three sides, service arms, work lights.',
    params: [{ key: 'walkways', label: 'Walkways', min: 1, max: 3, step: 1, def: 2 }, { key: 'arms', label: 'Service arms', min: 0, max: 1, step: 1, def: 1, names: ['Folded', 'Reaching in'] }],
    build(p) {
      const g = new THREE.Group();
      const frame = mat('#3c434d', 0.55, 0.45), yel = mat(HAZARD, 0.3, 0.5), grate = mat('#5a626c', 0.6, 0.5), rail = mat('#c9a030', 0.4, 0.5);
      const X = 6.4, Z = 6.4, H = 14;   // half sizes (m): the frame is 12.8 m square, open at the front (+x)
      bx(g, 15.4, 0.3, 15.4, mat('#4a4f56', 0.2, 0.9), 0, 0, 0);                        // service floor
      for (const [w, d, x, z] of [[15.4, 0.4, 0, 7.5], [15.4, 0.4, 0, -7.5], [0.4, 15.4, 7.5, 0], [0.4, 15.4, -7.5, 0]]) bx(g, w, 0.02, d, yel, x, 0.3, z);   // bay edge paint
      for (const x of [-X, X]) for (const z of [-Z, Z]) { bx(g, 0.9, H, 0.9, frame, x, 0.3, z); bx(g, 1.4, 0.4, 1.4, yel, x, 0.3, z); }
      // top beams + work lights
      for (const z of [-Z, Z]) bx(g, 2 * X + 0.9, 0.9, 0.7, frame, 0, H + 0.3, z);
      bx(g, 0.7, 0.9, 2 * Z + 0.9, frame, -X, H + 0.3, 0);
      for (let i = 0; i < 4; i++) for (const z of [-Z + 0.6, Z - 0.6]) bx(g, 1.0, 0.15, 0.4, HEAD(), -X + 1.5 + i * 3.2, H + 0.15, z);
      bx(g, 0.35, 0.35, 0.35, AMBER(), X, H + 1.2, Z); bx(g, 0.35, 0.35, 0.35, AMBER(), X, H + 1.2, -Z);
      // walkways: back + both sides, with railings, at even heights
      for (let w = 1; w <= p.walkways; w++) {
        const y = w * H / (p.walkways + 1);
        const deck = (dw, dd, x, z) => { bx(g, dw, 0.15, dd, grate, x, y, z); };
        deck(1.6, 2 * Z, -X + 1.2, 0); deck(2 * X - 1, 1.6, 0.5, -Z + 1.2); deck(2 * X - 1, 1.6, 0.5, Z - 1.2);
        rod(g, [-X + 2.0, y + 1.1, -Z + 2], [-X + 2.0, y + 1.1, Z - 2], 0.06, rail);
        for (const s of [-1, 1]) rod(g, [-X + 2, y + 1.1, s * (Z - 2.0)], [X - 0.5, y + 1.1, s * (Z - 2.0)], 0.06, rail);
        bx(g, 0.1, 0.1, 0.1, GREEN(), X - 0.6, y + 1.3, Z - 2.0);
      }
      // a caged ladder up the back-left column to every walkway
      for (let y = 0.6; y < H * p.walkways / (p.walkways + 1) + 0.5; y += 0.35) rod(g, [-X + 0.7, y, -Z + 0.9], [-X + 0.7, y, -Z + 1.5], 0.03, rail);
      for (const z of [-Z + 0.9, -Z + 1.5]) rod(g, [-X + 0.7, 0.3, z], [-X + 0.7, H * p.walkways / (p.walkways + 1) + 1.1, z], 0.04, rail);
      // service arms: two per side at chest and hip height, reaching to the mech or folded against the frame
      for (const s of [-1, 1]) for (const [y, x] of [[8.5, -1.5], [5.5, 1.5]]) {
        const base = [x, y, s * (Z - 0.5)];
        const elbow = p.arms ? [x + 0.6, y + 0.8, s * (Z - 2.8)] : [x + 1.6, y + 0.4, s * (Z - 0.9)];
        const hand = p.arms ? [x + 0.2, y + 0.2, s * 2.3] : [x + 2.8, y - 0.4, s * (Z - 0.9)];
        bx(g, 0.9, 0.9, 0.6, frame, base[0], base[1] - 0.45, base[2]);
        rod(g, base, elbow, 0.22, yel); rod(g, elbow, hand, 0.16, yel);
        ball(g, 0.28, frame, elbow[0], elbow[1], elbow[2], 8);
        bx(g, 0.3, 0.3, 0.3, mat(DARK), hand[0], hand[1] - 0.15, hand[2]);
        if (p.arms) bx(g, 0.12, 0.12, 0.12, neonMat('#bfe8ff', 0.9), hand[0] + 0.2, hand[1] - 0.1, hand[2] - s * 0.15);   // tool tip glow
      }
      // umbilical cables hanging from the top beam
      for (const z of [-2, 0, 2]) rod(g, [-X + 0.5, H, z], [-X + 2.5, 9, z * 0.6], 0.08, mat('#1e2024', 0.2, 0.8));
      return g;
    },
  },
  'ws-scissor': {
    name: 'Welding Scissor Lift', group: 'workshop', genre: ['industrial'], noStyle: true, size: [1, 1], bakeScale: 8,
    blurb: 'A scissor lift with a railed 2.6 × 1.2 m deck, raised from 1 to 10 m, a welder at work and the arc glowing.',
    params: [{ key: 'lift', label: 'Deck height', min: 1, max: 10, step: 1, def: 6, unit: 'm' }, { key: 'welder', label: 'Welder', min: 0, max: 1, step: 1, def: 1, names: ['No', 'Yes'] }],
    build(p) {
      const g = new THREE.Group();
      const body = mat('#e8742a', 0.3, 0.55), dark = mat(DARK, 0.5, 0.5), rail = mat('#c9cfd6', 0.6, 0.4);
      bx(g, 2.5, 0.55, 1.2, body, 0, 0.15, 0);
      for (const x of [-0.95, 0.95]) for (const s of [-1, 1]) wheel(g, 0.2, 0.15, x, s * 0.55);
      const top = p.lift, n = Math.max(1, Math.round((top - 0.8) / 1.4)), step = (top - 0.8) / n;
      for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
        const y0 = 0.75 + i * step, y1 = y0 + step;
        rod(g, [-1.0, y0, s * 0.5], [1.0, y1, s * 0.5], 0.06, dark); rod(g, [1.0, y0, s * 0.5], [-1.0, y1, s * 0.5], 0.06, dark);
      }
      bx(g, 2.6, 0.15, 1.2, body, 0, top, 0);
      for (const z of [-0.58, 0.58]) { rod(g, [-1.28, top + 1.1, z], [1.28, top + 1.1, z], 0.03, rail); rod(g, [-1.28, top + 0.55, z], [1.28, top + 0.55, z], 0.025, rail); }
      for (const x of [-1.28, 1.28]) { rod(g, [x, top + 1.1, -0.58], [x, top + 1.1, 0.58], 0.03, rail); for (const z of [-0.58, 0.58]) rod(g, [x, top, z], [x, top + 1.1, z], 0.03, rail); }
      bx(g, 0.5, 0.35, 0.4, mat('#8a2a24', 0.4, 0.5), -0.9, top + 0.15, 0.2);              // welding set
      bx(g, 0.12, 0.12, 0.12, AMBER(), -1.1, top + 1.12, -0.5);
      if (p.welder) crewFigure(g, { suit: '#2c3e66', pose: 2, x: 0.1, y: top + 0.15, z: 0 });
      else ball(g, 0.06, neonMat('#bfe8ff', 1), 1.2, top + 0.9, 0, 6);
      return g;
    },
  },
  'ws-reel': {
    name: 'Cable Reel', group: 'workshop', genre: ['industrial'], noStyle: true, size: [1, 1], bakeScale: 8,
    blurb: 'A 1.6 m drum of heavy power cable on a stand, the loose end run out to a junction box.',
    params: [{ key: 'wound', label: 'Cable on the drum', min: 1, max: 4, step: 1, def: 3, names: ['', 'A little', 'Half', 'Most', 'Full'] }],
    build(p) {
      const g = new THREE.Group();
      const wood = mat('#8a6a45', 0, 0.85), cable = mat('#1b1d21', 0.2, 0.7), steel = mat(STEEL, 0.6, 0.45);
      const R = 0.8, w = 1.0;
      for (const s of [-1, 1]) { const f = cy(g, R, 0.08, wood, 0, R - 0.04, s * w / 2, { seg: 20 }); f.rotation.x = Math.PI / 2; f.position.set(0, R * M, s * w / 2 * M); }
      const core = 0.3 + p.wound * 0.11;
      const c = cy(g, core, w - 0.1, cable, 0, 0, 0, { seg: 20 }); c.rotation.x = Math.PI / 2; c.position.set(0, R * M, 0);
      for (const s of [-1, 1]) { rod(g, [-0.6, 0, s * 0.62], [0, R, s * 0.62], 0.05, steel); rod(g, [0.6, 0, s * 0.62], [0, R, s * 0.62], 0.05, steel); }
      rod(g, [0, R, -0.7], [0, R, 0.7], 0.05, steel);
      // loose end across the floor to a junction box
      const pts = [[0.1, R - core, 0], [0.6, 0.06, 0.1], [1.6, 0.06, 0.6], [2.6, 0.06, 0.4], [3.4, 0.06, 1.0]];
      for (let i = 1; i < pts.length; i++) rod(g, pts[i - 1], pts[i], 0.06, cable);
      bx(g, 0.5, 0.7, 0.4, mat('#5d6b78', 0.4, 0.5), 3.6, 0, 1.0);
      bx(g, 0.04, 0.12, 0.16, GREEN(), 3.87, 0.45, 1.0);                          // status light on the box's front
      for (const s of [-1, 1]) { const t = cy(g, 0.805, 0.03, TAPE(), 0, 0.785, s * 0.53, { seg: 20 }); t.rotation.x = Math.PI / 2; t.position.set(0, 0.8 * M, s * 0.54 * M); }   // reflective rim
      return g;
    },
  },
  'ws-toolcart': {
    name: 'Tool Cart', group: 'workshop', genre: ['industrial'], noStyle: true, size: [1, 1], bakeScale: 8,
    blurb: 'A 1 m roll cart: drawers, a push handle, tools on top and a charging pad with its light on.',
    params: [{ key: 'paint', label: 'Paint', min: 0, max: PAINTS.length - 1, step: 1, def: 2, names: paintNames }],
    build(p) {
      const g = new THREE.Group();
      const body = mat(PAINTS[p.paint][1], 0.4, 0.45), dark = mat(DARK, 0.5, 0.5), steel = mat('#c9cfd6', 0.7, 0.35);
      bx(g, 1.0, 0.85, 0.55, body, 0, 0.12, 0);
      for (let i = 0; i < 5; i++) { bx(g, 0.02, 0.12, 0.5, dark, 0.51, 0.18 + i * 0.16, 0); bx(g, 0.02, 0.02, 0.3, steel, 0.53, 0.24 + i * 0.16, 0); }
      for (const x of [-0.42, 0.42]) for (const z of [-0.22, 0.22]) wheel(g, 0.06, 0.04, x, z);
      rod(g, [-0.5, 0.95, -0.25], [-0.62, 1.05, -0.25], 0.02, steel); rod(g, [-0.5, 0.95, 0.25], [-0.62, 1.05, 0.25], 0.02, steel); rod(g, [-0.62, 1.05, -0.25], [-0.62, 1.05, 0.25], 0.02, steel);
      bx(g, 0.3, 0.06, 0.12, mat('#c8332b'), -0.2, 0.97, 0.1);                   // drill
      rod(g, [0.1, 0.98, -0.15], [0.4, 0.98, -0.05], 0.015, steel);                 // wrench
      bx(g, 0.2, 0.02, 0.15, mat('#202428', 0.3, 0.4), 0.3, 0.97, 0.12);
      bx(g, 0.14, 0.012, 0.1, GREEN(), 0.3, 0.99, 0.12);                           // charging pad light
      return g;
    },
  },
  'ws-drums': {
    name: 'Oil Drums', group: 'workshop', genre: ['industrial'], noStyle: true, size: [1, 1], bakeScale: 8,
    blurb: '208-litre drums (0.6 m across, 0.9 m tall) on a pallet, banded with reflective tape; one lying on its side.',
    params: [{ key: 'count', label: 'Drums', min: 1, max: 8, step: 1, def: 5 }],
    build(p) {
      const g = new THREE.Group();
      const cols = ['#2f6fb3', '#c8332b', '#e3b52c', '#3f8a4a', '#6c737c'];
      bx(g, 2.4, 0.15, 1.3, mat('#8a6a45', 0, 0.9), 0, 0, 0);
      const spots = [[-0.85, -0.3], [-0.25, -0.3], [0.35, -0.3], [-0.85, 0.32], [-0.25, 0.32], [0.35, 0.32], [0.95, 0.0]];
      for (let i = 0; i < Math.min(p.count, 7); i++) {
        const [x, z] = spots[i], m = mat(p.R.pick(cols), 0.45, 0.45);
        cy(g, 0.29, 0.88, m, x, 0.15, z, { seg: 14 });
        for (const y of [0.4, 0.75]) cy(g, 0.3, 0.03, mat('#2a2d32', 0.5, 0.5), x, 0.15 + y, z, { seg: 14 });
        if (i % 2 === 0) cy(g, 0.302, 0.06, TAPE(), x, 0.6, z, { seg: 14 });
      }
      if (p.count >= 8) { const d = cy(g, 0.29, 0.88, mat(cols[1], 0.45, 0.45), 0, 0, 1.2, { seg: 14 }); d.rotation.x = Math.PI / 2; d.rotation.z = 0.4; d.position.set(1.2 * M, 0.29 * M, 1.1 * M); }
      return g;
    },
  },
  'ws-stack': {
    name: 'Crates & Containers', group: 'workshop', genre: ['industrial'], noStyle: true, size: [1, 1], bakeScale: 4,
    blurb: 'Stacked cargo: 1.2 m crates on pallets, or 12 m shipping containers (12.2 × 2.4 × 2.6 m) with ribbed sides.',
    params: [{ key: 'kind', label: 'Kind', min: 0, max: 1, step: 1, def: 1, names: ['Crates', 'Containers'] }, { key: 'count', label: 'How many', min: 1, max: 6, step: 1, def: 4 }],
    build(p) {
      const g = new THREE.Group();
      if (p.kind === 1) {
        const cols = ['#b5462e', '#2f6fb3', '#3f8a4a', '#d8a030', '#6c737c', '#7a3f8a'];
        for (let i = 0; i < p.count; i++) {
          const col = i % 2, lvl = Math.floor(i / 2), x = col ? 0 : 0, z = (col ? 1.35 : -1.35), y = lvl * 2.6;
          const m = mat(p.R.pick(cols), 0.4, 0.55), off = x + p.R.range(-0.3, 0.3);
          bx(g, 12.2, 2.6, 2.44, m, off, y, z);
          for (let k = 0; k <= 20; k++) bx(g, 0.12, 2.4, 2.5, m, off - 5.9 + k * 0.59, y + 0.1, z);   // corrugation ribs
          bx(g, 0.08, 2.4, 2.3, mat('#2a2d32', 0.5, 0.5), off + 6.12, y + 0.1, z);                    // doors
          bx(g, 0.1, 0.1, 0.1, AMBER(), off + 6.0, y + 2.6, z + 1.0);                                    // tracker light
        }
      } else {
        const wood = mat('#a07a4a', 0, 0.85), pal = mat('#7a5a3a', 0, 0.9);
        const spots = [[-1.4, -0.7, 0], [0, -0.7, 0], [-1.4, 0.7, 0], [0, 0.7, 0], [-0.7, 0, 1], [1.4, 0, 0]];
        for (let i = 0; i < p.count; i++) {
          const [x, z, lvl] = spots[i], y = lvl * 1.35;
          bx(g, 1.2, 0.15, 1.2, pal, x, y, z);
          bx(g, 1.15, 1.15, 1.15, wood, x, y + 0.15, z);
          for (const s of [-1, 1]) bx(g, 1.18, 0.1, 0.06, mat('#6a4a2a', 0, 0.9), x, y + 0.6, z + s * 0.58);
          if (i === 0) bx(g, 0.2, 0.12, 0.02, TAPE(), x + 0.3, y + 0.9, z + 0.59);
        }
      }
      return g;
    },
  },
  'ws-palletjack': {
    name: 'Pallet Jack', group: 'workshop', genre: ['industrial'], noStyle: true, dirs: 8, bakeScale: 8,
    blurb: 'An electric pallet jack: 1.15 m forks, 0.55 m wide, a tiller handle and a battery light.',
    params: [{ key: 'load', label: 'Load', min: 0, max: 1, step: 1, def: 1, names: ['Empty', 'A crate'] }],
    build(p) {
      return facing(g => {
        const red = mat('#c8332b', 0.4, 0.5), steel = mat('#8a949f', 0.6, 0.4);
        for (const s of [-1, 1]) bx(g, 1.15, 0.08, 0.16, steel, 0.55, 0.04, s * 0.2);
        bx(g, 0.45, 0.85, 0.7, red, -0.25, 0.05, 0);
        rod(g, [-0.3, 0.9, 0], [-0.7, 1.25, 0], 0.03, mat(DARK)); bx(g, 0.06, 0.06, 0.4, mat(DARK), -0.72, 1.24, 0);
        bx(g, 0.14, 0.03, 0.14, GREEN(), -0.2, 0.9, 0.18);                            // battery light on top
        bx(g, 0.46, 0.05, 0.71, TAPE(), -0.25, 0.6, 0);                                // reflective band
        for (const s of [-1, 1]) wheel(g, 0.05, 0.06, 1.05, s * 0.2);
        if (p.load) { bx(g, 1.2, 0.15, 1.0, mat('#7a5a3a', 0, 0.9), 0.6, 0.12, 0); bx(g, 1.1, 0.9, 0.95, mat('#a07a4a', 0, 0.85), 0.6, 0.27, 0); }
      });
    },
  },
  'ws-crew': {
    name: 'Crew Member', group: 'workshop', genre: ['industrial'], noStyle: true, dirs: 8, bakeScale: 8,
    blurb: 'A 1.8 m worker in coveralls and a hard hat, for scale: standing, pointing, welding or carrying a box.',
    params: [{ key: 'pose', label: 'Pose', min: 0, max: POSES.length - 1, step: 1, def: 0, names: POSES },
      { key: 'suit', label: 'Coveralls', min: 0, max: COVERALLS.length - 1, step: 1, def: 0, names: COVERALLS.map(c => c[0]) }],
    build(p) { return facing(g => crewFigure(g, { suit: COVERALLS[p.suit][1], pose: p.pose })); },
  },
  'ws-lamp': {
    name: 'Hanging Work Lamp', group: 'workshop', genre: ['industrial'], noStyle: true, size: [1, 1], bakeScale: 8,
    blurb: 'A high-bay work lamp on its cable. The ground point is the lamp itself: hang it at any height in a scene.',
    params: [{ key: 'drop', label: 'Cable', min: 1, max: 8, step: 1, def: 3, unit: 'm' }, { key: 'kind', label: 'Lamp', min: 0, max: 1, step: 1, def: 0, names: ['Dome', 'Light bar'] }],
    build(p) {
      const g = new THREE.Group();
      const shade = mat('#3a4049', 0.6, 0.4), warm = neonMat('#ffe2a8', 0.9);
      if (p.kind === 0) {
        add(g, G('lampdome', () => new THREE.CylinderGeometry(0.15 * M, 0.55 * M, 0.45 * M, 16, 1, true)), domeMat(), 0, 0.35 * M, 0);
        ball(g, 0.2, warm, 0, 0.18, 0, 10);
        cy(g, 0.12, 0.2, shade, 0, 0.55, 0);
        rod(g, [0, 0.75, 0], [0, 0.75 + p.drop, 0], 0.025, mat('#1e2024'));
      } else {
        bx(g, 1.4, 0.12, 0.3, shade, 0, 0.1, 0); bx(g, 1.3, 0.05, 0.22, warm, 0, 0.05, 0);
        for (const x of [-0.6, 0.6]) rod(g, [x, 0.22, 0], [x * 0.3, 0.22 + p.drop, 0], 0.02, mat('#1e2024'));
      }
      return g;
    },
  },
  'ws-floor': {
    name: 'Floor Markings', group: 'workshop', genre: ['industrial'], noStyle: true, size: [1, 1], bakeScale: 4,
    blurb: 'One 16 m workshop floor tile with painted markings and LED strips set into the floor.',
    params: [{ key: 'kind', label: 'Markings', min: 0, max: 3, step: 1, def: 0, names: ['Mech bay', 'Walkway', 'Hazard zone', 'Parking bays'] }],
    build(p) {
      const g = new THREE.Group();
      box(g, 0.98, 0.012, 0.98, new THREE.MeshStandardMaterial({ map: floorPaint(p.kind), roughness: 0.85, metalness: 0.1 }), 0, 0, 0);
      const led = neonMat('#46e8ff', 0.15), y = 0.012;
      if (p.kind === 0) for (const s of [-1, 1]) { box(g, 0.7, 0.003, 0.01, led, 0, y, s * 0.4); box(g, 0.01, 0.003, 0.7, led, s * 0.4, y, 0); }
      else if (p.kind === 1) for (const s of [-1, 1]) box(g, 0.98, 0.003, 0.008, led, 0, y, s * 0.13);
      else if (p.kind === 2) box(g, 0.01, 0.003, 0.9, neonMat('#ffb02e', 0.2), 0, y, 0);
      else for (let i = -1; i <= 1; i++) box(g, 0.008, 0.003, 0.4, led, i * 0.3, y, -0.25);
      return g;
    },
  },
});

/** Painted floor: concrete with the markings for each kind (yellow lines, black/yellow hazard stripes, arrows). */
let dome2 = null;
const domeMat = () => (dome2 ??= new THREE.MeshStandardMaterial({ color: '#3a4049', metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }));
const paintCache = new Map();
function floorPaint(kind) {
  if (paintCache.has(kind)) return paintCache.get(kind);
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#6e7176'; g.fillRect(0, 0, 512, 512);
  const R = rng(41 + kind);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '30,30,34' : '160,160,166'},0.12)`; g.fillRect(R() * 512, R() * 512, 3, 3); }
  g.strokeStyle = 'rgba(40,40,44,0.5)'; g.lineWidth = 2; for (let i = 128; i < 512; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
  const stripes = (x, y, w, h) => { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = '#e3b52c'; g.fillRect(x, y, w, h); g.fillStyle = '#1c1c1c'; for (let k = -512; k < 1024; k += 36) { g.beginPath(); g.moveTo(k, y); g.lineTo(k + 18, y); g.lineTo(k + 18 + h, y + h); g.lineTo(k + h, y + h); g.fill(); } g.restore(); };
  g.fillStyle = '#e3b52c';
  if (kind === 0) { stripes(40, 40, 432, 28); stripes(40, 444, 432, 28); stripes(40, 40, 28, 432); stripes(444, 40, 28, 432); g.fillRect(246, 160, 20, 192); g.fillRect(160, 246, 192, 20); }
  else if (kind === 1) { g.fillRect(0, 170, 512, 12); g.fillRect(0, 330, 512, 12); g.fillStyle = '#e8e8e8'; for (let x = 60; x < 512; x += 160) { g.beginPath(); g.moveTo(x, 225); g.lineTo(x + 60, 256); g.lineTo(x, 287); g.closePath(); g.fill(); } }
  else if (kind === 2) { stripes(20, 20, 472, 472); g.fillStyle = '#6e7176'; g.fillRect(110, 110, 292, 292); stripes(150, 150, 212, 212); }
  else { for (let i = 0; i < 4; i++) g.fillRect(40 + i * 144, 30, 10, 220); g.fillRect(40, 250, 442, 10); g.fillStyle = '#e8e8e8'; g.fillRect(40, 330, 442, 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  paintCache.set(kind, t); return t;
}
