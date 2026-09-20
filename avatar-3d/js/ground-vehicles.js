// Procedural ground vehicles from Three.js primitives: a motorcycle, a car and a truck, in the same
// chunky style as avatar-3d/js/vehicles.js (the carts and wagons) and prototypes/farhold/js/boat.js
// (the three hulls).
//
// **They are built facing +z, and that is the one thing to get right.** The carts in vehicles.js
// face +x because the stage rotates them wherever it likes; these are DRIVEN, by a character
// controller whose yaw of 0 points down +z (`forward.set(sin(yaw), 0, cos(yaw))` in Farhold's
// js/player.js). Building them +z means the group can take `rotation.y = control.yaw` with no
// correction anywhere, which is exactly the reasoning written at the top of boat.js — and the
// reason the boat does not need a fudge factor is that somebody got this right once already.
//
// So: length runs along z (the nose is at +z), the axles run along x, and a wheel is a cylinder
// turned on its side so it rolls about x.
//
//   import { createGroundVehicle } from './ground-vehicles.js';
//   const rig = createGroundVehicle();     // a THREE.Group, hidden, all three bodies inside it
//   scene.add(rig.group);
//   rig.show('truck');                     // swap body, make visible
//   rig.place(x, groundY, z, yaw);
//   rig.update(dt, speed);                 // wheels turn, the suspension settles
//   rig.hide();
//
// The numbers a game plays with (speed, fuel, what ground it will take) are NOT here — they live in
// prototypes/farhold/data/vehicles.json. This file only knows what the thing looks like.

import * as THREE from 'three';

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.82, metalness: 0.08, ...extra });
}
function mesh(geo, color, extra) {
  const m = new THREE.Mesh(geo, mat(color, extra));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
const box = (w, h, d, c, extra) => mesh(new THREE.BoxGeometry(w, h, d), c, extra);
const cyl = (rt, rb, h, c, s = 12, extra) => mesh(new THREE.CylinderGeometry(rt, rb, h, s), c, extra);
const metal = c => ({ roughness: 0.4, metalness: 0.7, color: c });

/** Default paint for each body, overridable from the vehicle's JSON `colors`. */
export const GROUND_COLORS = {
  motorcycle: { body: '#b8562e', frame: '#3a3f46', metal: '#8f97a2', glass: '#1b2733', trim: '#1d2024' },
  car: { body: '#3e6b7a', frame: '#2a3238', metal: '#98a0aa', glass: '#1b2733', trim: '#c8b47a' },
  truck: { body: '#7a6a3a', frame: '#32363c', metal: '#8f97a2', glass: '#1b2733', trim: '#4a4030' },
};

/** Size on the ground, so a collider or a camera framing does not have to guess. */
export const GROUND_METRICS = {
  motorcycle: { length: 2.1, width: 0.72, height: 1.15, wheelR: 0.36 },
  car: { length: 4.2, width: 1.86, height: 1.52, wheelR: 0.36 },
  truck: { length: 6.4, width: 2.36, height: 2.62, wheelR: 0.52 },
};

/**
 * One wheel, lying on its side so it rolls about x.
 *
 * A cylinder stands up by default; `rotation.z = PI/2` lays it over. The hub is a second, fatter
 * disc so that a spinning wheel reads as spinning rather than as a grey blur.
 */
function wheel(r, wide, C) {
  const g = new THREE.Group();
  const tyre = cyl(r, r, wide, '#1a1c20', 16);
  tyre.rotation.z = Math.PI / 2;
  g.add(tyre);
  const hub = cyl(r * 0.45, r * 0.45, wide * 1.12, C.metal, 10, metal(C.metal));
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  for (let i = 0; i < 4; i++) {
    const spoke = box(wide * 1.2, r * 1.3, 0.035, C.metal, metal(C.metal));
    spoke.rotation.x = (i / 4) * Math.PI;
    g.add(spoke);
  }
  return g;
}

/** A pair of wheels on one axle, added to `into` and collected so update() can spin them. */
function axle(into, wheels, z, r, wide, halfTrack, C) {
  for (const x of [-halfTrack, halfTrack]) {
    const w = wheel(r, wide, C);
    w.position.set(x, r, z);
    into.add(w);
    wheels.push(w);
  }
}

/** A glass panel. Dark, slightly shiny, never see-through — this is a chunky toy world. */
const pane = (w, h, d, C) => mesh(new THREE.BoxGeometry(w, h, d), C.glass, { roughness: 0.25, metalness: 0.4 });

/** A lamp that can be lit at night by whoever owns the light pool. */
function lamp(C, size = 0.12) {
  const m = mesh(new THREE.BoxGeometry(size, size * 0.8, 0.05), '#ffe6b0', { emissive: new THREE.Color('#ffd28a'), emissiveIntensity: 0.9, roughness: 0.3 });
  return m;
}

/**
 * One seat, two wheels and an engine bolted where the sense used to be.
 *
 * Deliberately skeletal: the whole read of a motorcycle is that there is nothing to it, which is
 * also why it carries a satchel and drowns in a stream.
 */
function buildMotorcycle(C) {
  const g = new THREE.Group();
  const M = GROUND_METRICS.motorcycle, R = M.wheelR;
  const wheels = [];
  axle(g, wheels, M.length / 2 - R, R, 0.12, 0, C);          // front, on the centre line
  axle(g, wheels, -M.length / 2 + R, R, 0.15, 0, C);         // rear, a little fatter

  const spine = box(0.16, 0.14, 1.25, C.frame);
  spine.position.set(0, R + 0.30, -0.05);
  g.add(spine);
  const engine = box(0.34, 0.34, 0.42, C.metal, metal(C.metal));
  engine.position.set(0, R + 0.10, -0.12);
  g.add(engine);
  for (let i = 0; i < 4; i++) {                              // cooling fins, because an engine needs a texture
    const fin = box(0.40, 0.03, 0.04, C.metal, metal(C.metal));
    fin.position.set(0, R + 0.02 + i * 0.07, 0.06);
    g.add(fin);
  }
  const tank = box(0.30, 0.26, 0.62, C.body);
  tank.position.set(0, R + 0.44, 0.12);
  g.add(tank);
  const seat = box(0.26, 0.12, 0.52, '#20232a');
  seat.position.set(0, R + 0.46, -0.44);
  g.add(seat);
  const tail = box(0.24, 0.08, 0.30, C.body);
  tail.position.set(0, R + 0.52, -0.78);
  g.add(tail);

  // forks and bars: two struts down to the front wheel and a bar across the top
  for (const x of [-0.13, 0.13]) {
    const fork = box(0.05, 0.72, 0.05, C.metal, metal(C.metal));
    fork.position.set(x, R + 0.34, M.length / 2 - R - 0.02);
    fork.rotation.x = -0.22;
    g.add(fork);
  }
  const bars = box(0.62, 0.05, 0.05, C.frame);
  bars.position.set(0, R + 0.70, 0.74);
  g.add(bars);
  for (const x of [-0.30, 0.30]) {
    const grip = cyl(0.035, 0.035, 0.14, C.trim, 8);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(x, R + 0.70, 0.74);
    g.add(grip);
  }
  const head = lamp(C, 0.16);
  head.position.set(0, R + 0.56, 0.86);
  g.add(head);
  const pipe = cyl(0.045, 0.06, 0.92, C.metal, 8, metal(C.metal));
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(0.18, R - 0.04, -0.34);
  g.add(pipe);
  const guard = box(0.26, 0.04, 0.34, C.frame);              // the front mudguard, so it is not all air
  guard.position.set(0, R + 0.36, M.length / 2 - R);
  g.add(guard);
  return { group: g, wheels, front: wheels.slice(0, 1) };
}

/** A box on four wheels with glass in it: four seats, a roof, and nothing off-road about it. */
function buildCar(C) {
  const g = new THREE.Group();
  const M = GROUND_METRICS.car, R = M.wheelR;
  const wheels = [];
  const half = M.width / 2 - 0.12;
  axle(g, wheels, M.length / 2 - 0.95, R, 0.22, half, C);
  axle(g, wheels, -M.length / 2 + 0.95, R, 0.22, half, C);

  const body = box(M.width, 0.58, M.length, C.body);
  body.position.y = R + 0.28;
  g.add(body);
  const skirt = box(M.width - 0.12, 0.22, M.length - 0.3, C.frame);
  skirt.position.y = R - 0.02;
  g.add(skirt);
  const cabin = box(M.width - 0.22, 0.52, M.length * 0.46, C.body);
  cabin.position.set(0, R + 0.82, -0.18);
  g.add(cabin);
  const roof = box(M.width - 0.18, 0.06, M.length * 0.44, C.trim);
  roof.position.set(0, R + 1.10, -0.18);
  g.add(roof);

  // windscreen, rear glass and a window on each side
  const front = pane(M.width - 0.34, 0.40, 0.06, C);
  front.position.set(0, R + 0.84, M.length * 0.06);
  front.rotation.x = 0.22;
  g.add(front);
  const back = pane(M.width - 0.34, 0.36, 0.06, C);
  back.position.set(0, R + 0.84, -M.length * 0.29);
  back.rotation.x = -0.22;
  g.add(back);
  for (const x of [-(M.width / 2 - 0.12), M.width / 2 - 0.12]) {
    const side = pane(0.05, 0.34, M.length * 0.30, C);
    side.position.set(x, R + 0.84, -0.14);
    g.add(side);
  }
  // lamps front and back, and a bumper at each end so it does not look sawn off
  for (const x of [-0.58, 0.58]) {
    const head = lamp(C, 0.20);
    head.position.set(x, R + 0.36, M.length / 2 + 0.02);
    g.add(head);
    const tail = box(0.22, 0.12, 0.05, '#8a2a20');
    tail.position.set(x, R + 0.40, -M.length / 2 - 0.02);
    g.add(tail);
  }
  for (const z of [M.length / 2 + 0.04, -M.length / 2 - 0.04]) {
    const bar = box(M.width + 0.06, 0.16, 0.10, C.metal, metal(C.metal));
    bar.position.set(0, R + 0.06, z);
    g.add(bar);
  }
  const rack = box(M.width - 0.5, 0.08, 0.7, C.trim);        // a roof rack; it carries nine, after all
  rack.position.set(0, R + 1.18, -0.3);
  g.add(rack);
  return { group: g, wheels };
}

/** Six wheels, a flat bed and low gearing. The only thing that can put a hull plate on the pad. */
function buildTruck(C) {
  const g = new THREE.Group();
  const M = GROUND_METRICS.truck, R = M.wheelR;
  const wheels = [];
  const half = M.width / 2 - 0.2;
  axle(g, wheels, M.length / 2 - 1.1, R, 0.28, half, C);      // steering axle
  axle(g, wheels, -M.length / 2 + 1.5, R, 0.30, half, C);     // two driven axles close together,
  axle(g, wheels, -M.length / 2 + 0.7, R, 0.30, half, C);     // which is what says "this one hauls"

  const chassis = box(M.width - 0.5, 0.26, M.length - 0.4, C.frame);
  chassis.position.y = R + 0.16;
  g.add(chassis);

  // cab at the nose, bed behind it
  const cab = box(M.width - 0.12, 1.06, 1.9, C.body);
  cab.position.set(0, R + 0.88, M.length / 2 - 1.15);
  g.add(cab);
  const screen = pane(M.width - 0.44, 0.52, 0.07, C);
  screen.position.set(0, R + 1.12, M.length / 2 - 0.22);
  screen.rotation.x = 0.14;
  g.add(screen);
  for (const x of [-(M.width / 2 - 0.08), M.width / 2 - 0.08]) {
    const side = pane(0.06, 0.42, 0.9, C);
    side.position.set(x, R + 1.08, M.length / 2 - 1.15);
    g.add(side);
  }
  const bed = box(M.width, 0.16, M.length * 0.52, C.trim);
  bed.position.set(0, R + 0.42, -M.length * 0.22);
  g.add(bed);
  for (const x of [-(M.width / 2 - 0.05), M.width / 2 - 0.05]) {   // side rails
    const rail = box(0.09, 0.52, M.length * 0.52, C.body);
    rail.position.set(x, R + 0.72, -M.length * 0.22);
    g.add(rail);
  }
  const tailgate = box(M.width, 0.52, 0.09, C.body);
  tailgate.position.set(0, R + 0.72, -M.length / 2 + 0.05);
  g.add(tailgate);
  const headboard = box(M.width, 0.78, 0.10, C.frame);
  headboard.position.set(0, R + 0.86, -M.length * 0.22 + M.length * 0.26);
  g.add(headboard);

  const stack = cyl(0.09, 0.11, 1.5, C.metal, 8, metal(C.metal));  // the exhaust stack behind the cab
  stack.position.set(M.width / 2 - 0.28, R + 1.5, M.length / 2 - 2.05);
  g.add(stack);
  const tank = cyl(0.2, 0.2, 0.9, C.metal, 10, metal(C.metal));    // and the fuel it drinks so much of
  tank.rotation.x = Math.PI / 2;
  tank.position.set(-(M.width / 2 - 0.18), R + 0.22, -0.4);
  g.add(tank);
  const bull = box(M.width - 0.2, 0.7, 0.12, C.metal, metal(C.metal));
  bull.position.set(0, R + 0.5, M.length / 2 + 0.06);
  g.add(bull);
  for (const x of [-0.72, 0.72]) {
    const head = lamp(C, 0.24);
    head.position.set(x, R + 0.56, M.length / 2 + 0.1);
    g.add(head);
  }
  return { group: g, wheels };
}

const BODIES = { motorcycle: buildMotorcycle, car: buildCar, truck: buildTruck };
/** The three ids this module can build, in ladder order. */
export const GROUND_TYPES = Object.keys(BODIES);

/**
 * One group holding all three bodies, with at most one visible — the same shape as `createBoat()`
 * in Farhold, and for the same reason: a vehicle is put away far more often than it is used, and
 * rebuilding geometry every time somebody presses the mount key is the kind of hitch you only
 * notice when you are moving.
 *
 * @param {object} [colors] per-type colour overrides, e.g. `{ car: { body: '#884422' } }`
 */
export function createGroundVehicle(colors = {}) {
  const group = new THREE.Group();
  group.visible = false;
  const bodies = {};
  for (const [key, build] of Object.entries(BODIES)) {
    const C = { ...GROUND_COLORS[key], ...(colors[key] || {}) };
    const built = build(C);
    built.group.visible = false;
    bodies[key] = built;
    group.add(built.group);
  }
  let current = null;
  let spin = 0;
  let lean = 0;

  return {
    group,
    get type() { return current; },
    /** Bring one body out. Anything unknown shows the motorcycle rather than nothing at all. */
    show(key) {
      const want = bodies[key] ? key : 'motorcycle';
      if (want !== current) {
        for (const [k, b] of Object.entries(bodies)) b.group.visible = k === want;
        current = want;
      }
      group.visible = true;
    },
    hide() { group.visible = false; },
    /** Sit it ON the ground: the wheels already start at y = 0 inside each body. */
    place(x, groundY, z, yaw) {
      group.position.set(x, groundY, z);
      group.rotation.y = yaw;
    },
    /**
     * Roll the wheels at the speed it is actually doing, and let the body lean into a turn.
     * @param {number} dt seconds
     * @param {number} speed metres a second
     * @param {number} [turn] -1..1, how hard it is cornering
     */
    update(dt, speed = 0, turn = 0) {
      const body = bodies[current];
      if (!body) return;
      const r = GROUND_METRICS[current].wheelR;
      spin += (speed / Math.max(0.01, r)) * dt;               // radians = distance / radius
      for (const w of body.wheels) w.rotation.x = -spin;
      // a motorcycle leans, everything else just rolls a little on its springs
      const want = current === 'motorcycle' ? turn * 0.45 : turn * 0.06;
      lean += (want - lean) * Math.min(1, dt * 5);
      body.group.rotation.z = lean;
      body.group.position.y = Math.abs(Math.sin(spin * 0.5)) * (speed > 0.1 ? 0.012 : 0);
    },
    /** The size of whichever body is showing, for a collider or a camera. */
    metrics(key = current) { return GROUND_METRICS[key] || GROUND_METRICS.motorcycle; },
    dispose() {
      group.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    },
  };
}
