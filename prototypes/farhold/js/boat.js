// Farhold — the boat you are standing in.
//
// "Boats should automatically equip when you start swimming and increase water travel movement
// speed." The speed lives in js/gear.js and the boarding lives in js/player.js; this is only the
// hull, so that going faster across a lake also LOOKS like going faster across a lake rather than
// swimming at an improbable pace.
//
// Three hulls for the three boats in js/gear.js, chunky Three.js primitives in the same style as
// avatar-3d/js/vehicles.js. Everything is built facing +z, because that is where the controller's
// yaw of 0 points (js/player.js: `forward.set(sin(yaw), 0, cos(yaw))`), so the group can take
// `rotation.y = control.yaw` with no correction.
//
//   import { createBoat } from './boat.js';
//   const boat = createBoat();          // a THREE.Group, hidden, all three hulls inside it
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
 * Deliberately the ugliest of the three: it is the one you are given, and the shop has to look like
 * an improvement from the first time you see it.
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

const HULLS = { raft: buildRaft, skiff: buildSkiff, cutter: buildCutter };

/**
 * One group holding all three hulls, with at most one visible.
 *
 * Built once at boot like the horse at js/main.js:513 — a boat is put away far more often than it
 * is used, and rebuilding geometry every time somebody wades into a river is the kind of hitch you
 * only notice on the water.
 */
export function createBoat() {
  const group = new THREE.Group();
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
    /** A slow bob at rest and a heel into the direction of travel when moving. */
    update(dt, moving = 0) {
      t += dt;
      group.position.y += Math.sin(t * 1.6) * 0.02;
      group.rotation.z = Math.sin(t * 1.1) * 0.03;
      group.rotation.x = -Math.min(0.09, moving * 0.012);      // the bow lifts as it gets going
    },
    dispose() {
      group.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    },
  };
}
