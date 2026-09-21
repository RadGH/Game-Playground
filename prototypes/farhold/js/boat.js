// Farhold — the boat you are standing in.
//
// "Boats should automatically equip when you start swimming and increase water travel movement
// speed." The speed lives in js/gear.js and the boarding lives in js/player.js; this is only the
// hull, so that going faster across a lake also LOOKS like going faster across a lake rather than
// swimming at an improbable pace.
//
// Four hulls for the four boats in js/gear.js — three you can buy and the Pitch Launch you have to
// build — chunky Three.js primitives in the same style as avatar-3d/js/vehicles.js. Everything is
// built facing +z, because that is where the controller's
// yaw of 0 points (js/player.js: `forward.set(sin(yaw), 0, cos(yaw))`), so the group can take
// `rotation.y = control.yaw` with no correction.
//
//   import { createBoat } from './boat.js';
//   const boat = createBoat();          // a THREE.Group, hidden, every hull inside it
//   scene.add(boat.group);
//   boat.show('skiff');                 // swap hull, make visible
//   boat.place(x, waterSurface, z, yaw);
//   boat.update(dt, moving);            // bob and heel
//   boat.hide();

import * as THREE from 'three';

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.88, metalness: 0, ...extra });
}
function mesh(geo, color, extra) {
  const m = new THREE.Mesh(geo, mat(color, extra));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const box = (w, h, d, c, extra) => mesh(new THREE.BoxGeometry(w, h, d), c, extra);
const cyl = (rt, rb, h, c, s = 10, extra) => mesh(new THREE.CylinderGeometry(rt, rb, h, s), c, extra);

/**
 * Six logs and a great deal of rope.
 *
 * Deliberately the ugliest of them: it is the one you are given, and the shop has to look like an
 * improvement from the first time you see it.
 */
function buildRaft() {
  const g = new THREE.Group();
  const wood = '#6a5238', rope = '#9a8a62';
  for (let i = 0; i < 6; i++) {
    const log = cyl(0.17, 0.17, 2.6, i % 2 ? wood : '#5e482f');
    log.rotation.x = Math.PI / 2;               // a cylinder stands up by default; lay it along z
    log.position.set(-0.75 + i * 0.3, 0, 0);
    g.add(log);
  }
  // the two lashings across the logs, which is the only thing holding it together
  for (const z of [-0.85, 0.85]) {
    const lash = box(2.0, 0.07, 0.09, rope);
    lash.position.set(0, 0.16, z);
    g.add(lash);
  }
  return g;
}

/** Flat-bottomed, pointed at the bow, low sides — a punt for reed channels. */
function buildSkiff() {
  const g = new THREE.Group();
  const wood = '#7a6a4a', trim = '#5a4a33';
  const floor = box(1.15, 0.12, 3.0, wood);
  floor.position.y = -0.02;
  g.add(floor);
  for (const x of [-0.58, 0.58]) {
    const side = box(0.09, 0.34, 3.0, trim);
    side.position.set(x, 0.16, 0);
    g.add(side);
  }
  // the bow: a wedge closing the front of the two sides
  const bow = mesh(new THREE.ConeGeometry(0.6, 0.9, 4), trim);
  bow.rotation.x = -Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 0.1, 1.85);
  g.add(bow);
  const thwart = box(1.2, 0.09, 0.28, trim);       // the plank you sit on
  thwart.position.set(0, 0.3, -0.5);
  g.add(thwart);
  return g;
}

/** A keel, a sail, and somewhere dry to sit. */
function buildCutter() {
  const g = new THREE.Group();
  const hull = '#4a5a6a', trim = '#32404d', canvas = '#d8d2c0';
  const body = box(1.4, 0.5, 4.2, hull);
  body.position.y = 0.05;
  g.add(body);
  const keel = box(0.16, 0.42, 3.0, trim);
  keel.position.y = -0.3;
  g.add(keel);
  const bow = mesh(new THREE.ConeGeometry(0.75, 1.3, 4), hull);
  bow.rotation.x = -Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 0.05, 2.6);
  g.add(bow);
  const deck = box(1.45, 0.08, 1.6, trim);
  deck.position.set(0, 0.32, -1.1);
  g.add(deck);
  const mast = cyl(0.07, 0.09, 3.4, trim);
  mast.position.set(0, 1.9, 0.3);
  g.add(mast);
  const sail = box(0.06, 2.2, 1.5, canvas, { side: THREE.DoubleSide });
  sail.position.set(0.05, 2.0, -0.35);
  g.add(sail);
  return g;
}

/**
 * The Pitch Launch — the rung the shop does not sell.
 *
 * "More craftable equipment: … boats." It is the only boat with an engine, so it is the only one
 * that reads as machinery rather than carpentry: a cabin, a stack with a sooty top, and a churn of
 * water at the stern instead of a sail. That difference has to be visible from the shore, otherwise
 * the fastest boat in the game looks exactly like the second fastest.
 */
function buildLaunch() {
  const g = new THREE.Group();
  const hull = '#5a5248', trim = '#3a3630', metal = '#8f97a2', glass = '#1b2733';
  const body = box(1.5, 0.55, 4.6, hull);
  body.position.y = 0.05;
  g.add(body);
  const rubbing = box(1.58, 0.1, 4.4, trim);          // the rubbing strake along the waterline
  rubbing.position.y = 0.2;
  g.add(rubbing);
  const bow = mesh(new THREE.ConeGeometry(0.8, 1.4, 4), hull);
  bow.rotation.x = -Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 0.05, 2.9);
  g.add(bow);
  const deck = box(1.52, 0.08, 2.2, trim);
  deck.position.set(0, 0.34, 0.4);
  g.add(deck);
  // the wheelhouse: a box with dark glass in the front of it
  const house = box(1.1, 0.8, 1.3, hull);
  house.position.set(0, 0.75, -0.3);
  g.add(house);
  const screen = mesh(new THREE.BoxGeometry(0.9, 0.34, 0.06), glass, { roughness: 0.25, metalness: 0.4 });
  screen.position.set(0, 0.95, 0.34);
  g.add(screen);
  const stack = cyl(0.11, 0.13, 0.85, metal, 10, { roughness: 0.45, metalness: 0.65 });
  stack.position.set(0.3, 1.3, -0.8);
  g.add(stack);
  const soot = cyl(0.12, 0.12, 0.12, '#1a1c20', 10);
  soot.position.set(0.3, 1.74, -0.8);
  g.add(soot);
  // the fuel can lashed to the deck, which is the whole reason this boat can run out
  const can = box(0.3, 0.34, 0.24, '#8a5a2a');
  can.position.set(-0.45, 0.55, -1.2);
  g.add(can);
  const prop = cyl(0.22, 0.22, 0.06, metal, 10, { roughness: 0.4, metalness: 0.75 });
  prop.rotation.x = Math.PI / 2;
  prop.position.set(0, -0.15, -2.35);
  g.add(prop);
  return g;
}

const HULLS = { raft: buildRaft, skiff: buildSkiff, cutter: buildCutter, launch: buildLaunch };

/**
 * One group holding every hull, with at most one visible.
 *
 * Built once at boot like the horse at js/main.js:513 — a boat is put away far more often than it
 * is used, and rebuilding geometry every time somebody wades into a river is the kind of hitch you
 * only notice on the water.
 */
export function createBoat() {
  const group = new THREE.Group();
  /**
   * R16 — THE CORNER THAT DIPPED.
   *
   *   "The raft also tilts asymmetrically dipping the top right corner into the water."
   *
   * The raft geometry is symmetric; the fault was the rotation ORDER. Three.js defaults to `XYZ`,
   * which builds the matrix as Rx·Ry·Rz with the YAW IN THE MIDDLE — so `rotation.x` is a tilt
   * about the WORLD x axis, not about the boat's own beam. Pointing north it lifted the bow as
   * intended; pointing east the identical number became a pure roll, and on any heading between
   * the two it went in diagonally and put one corner under the surface. `YXZ` turns the boat
   * first and then pitches and rolls it in its own frame, which is what every one of these three
   * numbers was written to mean.
   */
  group.rotation.order = 'YXZ';
  group.visible = false;
  const hulls = {};
  for (const [key, build] of Object.entries(HULLS)) {
    const hull = build();
    hull.visible = false;
    hulls[key] = hull;
    group.add(hull);
  }
  let current = null;
  let t = 0;
  let pitch = 0;

  return {
    group,
    /** Bring one hull out. Anything unknown falls back to the raft rather than showing nothing. */
    show(key) {
      const want = hulls[key] ? key : 'raft';
      if (want !== current) {
        for (const [k, hull] of Object.entries(hulls)) hull.visible = k === want;
        current = want;
      }
      group.visible = true;
    },
    hide() { group.visible = false; },
    /**
     * Sit the hull ON the water rather than at the swimmer's waist.
     *
     * `control.y` while swimming is the body's height, which is under the surface — putting the boat
     * there floats it like a submarine. The caller passes `control.waterSurface`, and the hull drops
     * a little below it so the waterline cuts the hull instead of the hull hovering on top.
     */
    place(x, surface, z, yaw) {
      group.position.set(x, surface - 0.12, z);
      group.rotation.y = yaw;
    },
    /**
     * A slow bob at rest and a heel into the direction of travel when moving.
     *
     * The pitch EASES rather than snapping to its clamp. It used to be `-min(0.09, moving*0.012)`
     * against a raft that does 11.3 m/s, so the term was pinned at its maximum from the first
     * metre and never came back to level — a permanent 5° nose-up list on a 2.6 m hull.
     */
    update(dt, moving = 0) {
      t += dt;
      const wantPitch = -Math.min(0.055, Math.max(0, moving) * 0.006);
      pitch += (wantPitch - pitch) * Math.min(1, dt * 2.2);
      group.position.y += Math.sin(t * 1.6) * 0.02;
      group.rotation.z = Math.sin(t * 1.1) * 0.025;            // a gentle roll, in the boat's own frame
      group.rotation.x = pitch;
    },
    /**
     * How far above the water the deck is, so whoever is aboard stands ON it. The raft's logs are
     * 0.17 m in radius and the hull sits 0.12 m under the surface, which puts the top of the logs
     * a few centimetres proud; the other three hulls have real floors, so they get a little more.
     */
    deckHeight() { return current === 'raft' ? 0.06 : 0.16; },
    dispose() {
      group.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    },
  };
}
