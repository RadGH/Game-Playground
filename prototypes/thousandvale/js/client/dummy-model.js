// The training dummy (report #61: "create a custom model for training dummies instead of using a dog").
//
// A wooden post on a cross-braced base, a straw-stuffed sack torso and head with a stitched face, a crossbar for arms
// with straw sticking out of the cuffs, a battered round shield on one arm and a painted target board on the chest.
// About 1.9 m tall, ~600 triangles, TWO merged vertex-coloured meshes on one shared material: the base, which stays put,
// and everything above it, which rocks on the post when it is hit and settles again (a damped spring — the dummy never
// dies, so that is its whole repertoire).
//
//   createDummyBody({ seed })  ->  { group, metrics(), setAnim(), setRate(), update(dt), hit(dx, dz, yaw, amount), dispose() }
//
// The same small interface actors.js asks of a creature body, so name plate, health bar, target ring, damage numbers and
// the click volume all work as they do for any monster. `dummyGeometry()` is exported for tests and for anything that
// wants the dummy as a static prop.

import * as THREE from 'three';
import { merged } from './prof-models.js';
import { settle, knock } from './body-kind.js';
export { settle, knock };

const WOOD = '#6e553d', WOOD_DARK = '#4a3a2c', SACK = '#b59a62', SACK_DARK = '#8f7748', STRAW = '#d9c06a', ROPE = '#7a6a4a', IRON = '#5a5f66', RED = '#a8322a', WHITE = '#e8e0cc', INK = '#2a211a';
export const DUMMY_HEIGHT = 1.92;
/** Where the upper part rocks from (just above the braces). */
const PIVOT_Y = 0.16;

const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1))); return g; };
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/** -> { base, top }: two merged geometries in metres, feet at y 0, facing +z. `top` is modelled around its pivot (y = 0 is PIVOT_Y). */
export function dummyGeometry(seed = 1) {
  let s = (seed >>> 0) || 1; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const base = [], top = [];
  // --- the base: two crossed sleepers and four braces up to the post
  for (const ry of [Math.PI / 4, -Math.PI / 4]) base.push({ g: at(box(1.3, 0.11, 0.16), 0, 0.055, 0, 0, ry), c: WOOD_DARK });
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, g = box(0.07, 0.62, 0.07);
    at(g, 0, 0, 0, 0, 0, 0.72); at(g, 0.24, 0.33, 0);              // lean in from 0.45 m out to the post
    at(g, 0, 0, 0, 0, a); base.push({ g, c: WOOD });
  }
  base.push({ g: at(new THREE.CylinderGeometry(0.075, 0.085, PIVOT_Y + 0.06, 6), 0, (PIVOT_Y + 0.06) / 2, 0), c: WOOD });
  // --- everything that rocks (y measured from the pivot)
  const Y = y => y - PIVOT_Y;
  top.push({ g: at(new THREE.CylinderGeometry(0.065, 0.075, 1.2, 6), 0, Y(0.76), 0), c: WOOD });
  // the crossbar, through the shoulders
  top.push({ g: at(new THREE.CylinderGeometry(0.045, 0.045, 1.36, 6), 0, Y(1.4), -0.02, 0, 0, Math.PI / 2), c: WOOD });
  // the sack torso: patched burlap, darker toward the bottom where it has been rained on
  const torso = new THREE.SphereGeometry(0.3, 9, 7); torso.scale(1, 1.36, 0.82);
  top.push({ g: at(torso, 0, Y(1.15), 0), c: v => (v.y < Y(0.95) ? SACK_DARK : (Math.sin(v.x * 23 + v.y * 17) > 0.72 ? SACK_DARK : SACK)) });
  top.push({ g: at(new THREE.TorusGeometry(0.265, 0.022, 4, 12), 0, Y(0.98), 0, Math.PI / 2), c: ROPE });      // belt rope
  // stuffed sleeves on the bar, tied at the cuff, straw out of the end
  for (const sx of [-1, 1]) {
    top.push({ g: at(new THREE.CylinderGeometry(0.085, 0.105, 0.34, 7), sx * 0.42, Y(1.4), -0.02, 0, 0, sx * Math.PI / 2), c: SACK });
    top.push({ g: at(new THREE.TorusGeometry(0.085, 0.018, 4, 8), sx * 0.57, Y(1.4), -0.02, 0, Math.PI / 2), c: ROPE });
    for (let k = 0; k < 4; k++) top.push({ g: at(new THREE.ConeGeometry(0.022, 0.2, 4), sx * 0.67, Y(1.4) + (rnd() - 0.5) * 0.07, -0.02 + (rnd() - 0.5) * 0.07, 0, 0, -sx * (Math.PI / 2 + (rnd() - 0.5) * 0.7)), c: STRAW });
  }
  // the head: a smaller sack, tied at the neck, with a stitched face and straw out of the top
  const head = new THREE.SphereGeometry(0.19, 9, 7); head.scale(1, 1.06, 0.95);
  top.push({ g: at(head, 0, Y(1.72), 0), c: SACK });
  top.push({ g: at(new THREE.TorusGeometry(0.12, 0.022, 4, 10), 0, Y(1.55), 0, Math.PI / 2), c: ROPE });
  for (let k = 0; k < 5; k++) { const a = rnd() * Math.PI * 2, t = 0.25 + rnd() * 0.35; top.push({ g: at(new THREE.ConeGeometry(0.02, 0.2, 4), Math.sin(a) * 0.05, Y(1.95), Math.cos(a) * 0.05, Math.cos(a) * t, 0, -Math.sin(a) * t), c: STRAW }); }
  for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; top.push({ g: at(new THREE.ConeGeometry(0.02, 0.15, 4), Math.sin(a) * 0.14, Y(1.5), Math.cos(a) * 0.13, Math.cos(a) * 2.2, 0, -Math.sin(a) * 2.2), c: STRAW }); }
  for (const sx of [-1, 1]) for (const r of [0.75, -0.75]) top.push({ g: at(box(0.075, 0.016, 0.012), sx * 0.07, Y(1.76), 0.172, 0, sx * 0.3, r), c: INK });    // crossed-stitch eyes
  top.push({ g: at(box(0.13, 0.014, 0.012), 0, Y(1.655), 0.176), c: INK });                                               // a stitched mouth…
  for (const x of [-0.04, 0, 0.04]) top.push({ g: at(box(0.012, 0.045, 0.012), x, Y(1.655), 0.178), c: INK });           // …and its stitches
  // a painted target board hung on the chest
  const disc = (r, z, c) => top.push({ g: at(new THREE.CylinderGeometry(r, r, 0.014, 14), 0, Y(1.17), z, Math.PI / 2), c });
  disc(0.19, 0.25, WOOD); disc(0.165, 0.258, WHITE); disc(0.115, 0.266, RED); disc(0.065, 0.274, WHITE); disc(0.028, 0.282, RED);
  for (const sx of [-1, 1]) top.push({ g: at(box(0.012, 0.3, 0.012), sx * 0.1, Y(1.42), 0.22, 0.12, 0, sx * 0.25), c: ROPE });   // the cords it hangs by
  // a battered round shield strapped to one arm: planks, an iron rim and boss, and two sword cuts in it
  const sh = [];
  sh.push({ g: at(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 12), 0, 0, 0, Math.PI / 2), c: v => (Math.floor((v.x + 0.3) / 0.12) % 2 ? WOOD : WOOD_DARK) });
  sh.push({ g: at(new THREE.TorusGeometry(0.3, 0.022, 4, 12), 0, 0, 0.005), c: IRON });
  sh.push({ g: at(new THREE.SphereGeometry(0.075, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0, 0.02, Math.PI / 2), c: IRON });
  sh.push({ g: at(box(0.2, 0.014, 0.012), 0.1, 0.14, 0.024, 0, 0, 0.6), c: INK });
  sh.push({ g: at(box(0.16, 0.014, 0.012), -0.12, -0.1, 0.024, 0, 0, -0.9), c: INK });
  for (const p of sh) top.push({ g: at(p.g, -0.52, Y(1.3), 0.1, 0.06, -0.22, 0.12), c: typeof p.c === 'function' ? WOOD : p.c });
  return { base: merged(base), top: merged(top) };
}

let shared = null;       // one geometry pair + one material for every dummy in the world
function parts() {
  if (!shared) shared = { ...dummyGeometry(7), mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true }) };
  return shared;
}

export function createDummyBody() {
  const { base, top, mat } = parts();
  const group = new THREE.Group(); group.name = 'training_dummy';
  const foot = new THREE.Mesh(base, mat), rock = new THREE.Mesh(top, mat);
  rock.position.y = PIVOT_Y;
  group.add(foot, rock);
  const s = { ax: 0, az: 0, tw: 0, vx: 0, vz: 0, vt: 0 };
  return {
    group, isProp: true,
    metrics: () => ({ height: DUMMY_HEIGHT, totalHeight: DUMMY_HEIGHT }),
    setAnim() {}, setRate() {},
    update(dt) { settle(s, dt); rock.rotation.set(s.ax, s.tw, s.az); },
    hit(dx, dz, yaw, amount) { knock(s, dx, dz, yaw, amount); },
    dispose() { /* geometry and material are shared by every dummy */ },
  };
}
