// Procedural travel vehicles from Three.js primitives, in the same chunky style as the creatures:
// hand cart, pack mule, covered wagon, ox cart, an iron-plated war wagon, a closed coach and a sled
// pulled by something with teeth. Draft animals are real creature bodies (createCreature), so a horse
// pulling a wagon is the same horse the bestiary uses.
//
// Everything is built facing +x (the cart rolls "forward" along +x, the animal is at the front, the
// axles run along z). Rotate the returned group to aim it wherever the scene needs.
//
// Vehicle JSON:
//   { type: 'wagon', size: 1, colors: { wood, trim, metal, cloth }, seed: 1 }
// Animations: idle (a little sway, the animal breathing) · roll (wheels turn, the animal walks) · dead (parked, nobody home)
//
// API — the same shape as createCreature/createMiiCharacter:
//   const v = await createVehicle('wagon');
//   v.group            THREE.Group, facing +x
//   v.metrics()        { length, width, height, wheelR, hitch: {x,y,z}, seat: {x,y,z} }
//   v.setAnim('roll') · v.update(dt, t) · v.setSpec(spec) · v.dispose()
import * as THREE from 'three';
import { createCreature } from './creatures.js';
import { shade } from '../../avatar-2d/js/render.js';

function mat(color, extra = {}) { return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0, ...extra }); }
function mesh(geo, color, extra) { const m = new THREE.Mesh(geo, mat(color, extra)); m.castShadow = true; m.receiveShadow = true; return m; }
const box = (w, h, d, c, extra) => mesh(new THREE.BoxGeometry(w, h, d), c, extra);
const cyl = (rt, rb, h, c, s = 14, extra) => mesh(new THREE.CylinderGeometry(rt, rb, h, s), c, extra);
const sphere = (r, c, s = 12) => mesh(new THREE.SphereGeometry(r, s, s), c);
const metalMat = c => mat(c, { roughness: 0.45, metalness: 0.75 });

/**
 * Type catalog. `plan` picks the builder, `body` the proportions, `animal` the creature that pulls it.
 * Sizes are in metres at size 1, so a covered wagon is about 2.4 m long and stands 1.7 m to the hoops.
 */
export const VEHICLE_TYPES = {
  hand_cart: {
    label: 'Hand cart', plan: 'cart', animal: null,
    body: { bedLen: 1.0, bedWide: 0.72, bedH: 0.1, sideH: 0.22, wheelR: 0.34, wheelWide: 0.07, axleZ: 0.42, shafts: 0.75, cargo: 2 },
    colors: { wood: '#8a6438', trim: '#5c3f20', metal: '#6a6a72', cloth: '#c8b48a' },
    desc: 'Two wheels and a pair of shafts. Somebody in the party is the engine.',
  },
  pack_mule: {
    label: 'Pack mule', plan: 'pack', animal: { type: 'horse', size: 0.78, colors: { body: '#6b6259', belly: '#8a8076', accent: '#2a2620' } },
    body: { packR: 0.22, packLen: 0.4, cargo: 3 },
    colors: { wood: '#7a5a34', trim: '#4a3418', metal: '#6a6a72', cloth: '#b8a884' },
    desc: 'No cart at all: crates and grain sacks roped over a mule\'s back.',
  },
  wagon: {
    label: 'Covered wagon', plan: 'wagon', animal: { type: 'horse', size: 1, colors: { body: '#7a4a2a' } },
    body: { bedLen: 2.3, bedWide: 1.0, bedH: 0.13, sideH: 0.34, wheelR: 0.42, wheelRear: 0.52, wheelWide: 0.09, axleZ: 0.58, shafts: 1.15, hoops: 4, coverR: 0.62, cargo: 3, bench: true },
    colors: { wood: '#96703f', trim: '#5c3f20', metal: '#6a6a72', cloth: '#ddd0b2' },
    desc: 'Canvas over four hoops, high sides, one horse in the shafts.',
  },
  ox_cart: {
    label: 'Ox cart', plan: 'cart', animal: { type: 'boar', size: 1.9, colors: { body: '#4a3a2c', belly: '#6a5844', accent: '#241a12' }, features: { tusks: true, horns: true, hooves: true } },
    body: { bedLen: 1.6, bedWide: 1.0, bedH: 0.16, sideH: 0.42, wheelR: 0.52, wheelWide: 0.12, axleZ: 0.55, shafts: 1.2, cargo: 4, solidWheels: true },
    colors: { wood: '#7d6038', trim: '#4a3418', metal: '#5f5f66', cloth: '#b8a884' },
    desc: 'Heavy solid wheels, a deep bed and an ox that does not hurry.',
  },
  war_wagon: {
    label: 'War wagon', plan: 'wagon', animal: { type: 'horse', size: 1.05, colors: { body: '#3a332c', belly: '#5a5048', accent: '#1a1610' } }, animals: 2,
    body: { bedLen: 2.5, bedWide: 1.1, bedH: 0.16, sideH: 0.56, wheelR: 0.44, wheelRear: 0.54, wheelWide: 0.13, axleZ: 0.62, shafts: 1.2, hoops: 0, cargo: 2, bench: true, plates: true, spikes: true, shields: 3 },
    colors: { wood: '#5e4a33', trim: '#33281a', metal: '#7b8089', cloth: '#8a3a2a' },
    desc: 'Iron plates bolted over the sides, spiked hubs, a rack of shields. Raiders pick someone else.',
  },
  coach: {
    label: 'Fast coach', plan: 'coach', animal: { type: 'horse', size: 1, colors: { body: '#2e2a26', belly: '#4a443c', accent: '#141210' } }, animals: 2,
    body: { bedLen: 1.9, bedWide: 0.95, cabinH: 0.95, wheelR: 0.38, wheelRear: 0.56, wheelWide: 0.08, axleZ: 0.55, shafts: 1.25, lanterns: true, roofRail: true, bench: true },
    colors: { wood: '#4a2f3a', trim: '#c8a44a', metal: '#6a6a72', cloth: '#e0c878' },
    desc: 'A closed cabin, gold trim and lanterns. Everything on the road can see you coming.',
  },
  dragon_sled: {
    label: 'Dragon sled', plan: 'sled', animal: { type: 'drake', size: 1.5, colors: { body: '#3a4a6a', belly: '#9ab8d8', accent: '#1a2030', eyes: '#9ce8ff' } },
    body: { bedLen: 2.0, bedWide: 1.0, bedH: 0.14, sideH: 0.4, runnerR: 0.09, axleZ: 0.5, shafts: 1.3, cargo: 2, glow: true },
    colors: { wood: '#4a4458', trim: '#8a7ad0', metal: '#8fa8c8', cloth: '#6a5aa8' },
    desc: 'Steel runners instead of wheels, harnessed to something that should not be tame.',
  },
};
export const VEHICLE_ANIMS = ['idle', 'roll', 'dead'];

/** Game vehicle id (js/game.js VEHICLES) → model in this catalog. `none` means the party walks. */
export const VEHICLE_MODEL_FOR = { none: null, mule: 'pack_mule', wagon: 'wagon', ox_cart: 'ox_cart', war_wagon: 'war_wagon', coach: 'coach', dragon_sled: 'dragon_sled', hand_cart: 'hand_cart' };
/** The model id for a game vehicle id, or null when there is nothing to draw. */
export function vehicleModelFor(gameId) { return VEHICLE_MODEL_FOR[gameId] ?? (VEHICLE_TYPES[gameId] ? gameId : null); }

export function normalizeVehicle(spec = {}) {
  const type = VEHICLE_TYPES[spec.type] ? spec.type : 'wagon'; const T = VEHICLE_TYPES[type];
  return { type, size: spec.size ?? 1, colors: { ...T.colors, ...(spec.colors || {}) }, seed: spec.seed ?? 1, animal: spec.animal === null ? null : (spec.animal || T.animal) };
}

/**
 * Build a vehicle. Async because the draft animal is a creature body.
 * @param {string|object} spec  a type id ('wagon') or a vehicle JSON document
 */
export async function createVehicle(spec) {
  const group = new THREE.Group(); group.userData.vehicle = true;
  const state = { anim: 'idle', t: 0, spec: null, parts: {}, animals: [], roll: 0 };
  const clear = () => { while (group.children.length) { const o = group.children[0]; o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); group.remove(o); } };

  async function build(sp) {
    const s = normalizeVehicle(typeof sp === 'string' ? { type: sp } : sp); state.spec = s;
    for (const a of state.animals) a.ctrl.dispose(); state.animals = []; clear();
    const T = VEHICLE_TYPES[s.type]; const root = new THREE.Group(); root.scale.setScalar(s.size); group.add(root); state.root = root;
    state.parts = ({ cart: buildCart, wagon: buildWagon, coach: buildCoach, sled: buildSled, pack: buildPack })[T.plan](root, T, s);
    // draft animals: real creature bodies, turned to face the way the cart rolls (+x) and set walking
    if (s.animal) {
      const n = T.animals || 1; const hitch = state.parts.hitch;
      for (let i = 0; i < n; i++) {
        const ctrl = await createCreature(s.animal);
        const m = ctrl.metrics();                                              // measured before turning it, so length is still nose-to-tail
        const g = ctrl.group; g.rotation.y = Math.PI / 2;                      // creatures face +z; the cart rolls +x
        const lane = n === 1 ? 0 : (i - (n - 1) / 2) * (m.width + 0.24);
        const at = state.parts.animalAt || { x: hitch.x + m.length * 0.55, z: hitch.z };
        g.position.set(at.x, 0, at.z + lane);
        root.add(g); state.animals.push({ ctrl, group: g });
      }
    }
  }
  await build(spec);

  return {
    group, get anim() { return state.anim; }, get spec() { return state.spec; },
    setAnim(n) { state.anim = VEHICLE_ANIMS.includes(n) ? n : 'idle'; for (const a of state.animals) a.ctrl.setAnim(n === 'roll' ? 'walk' : n === 'dead' ? 'idle' : 'idle'); },
    async setSpec(sp) { await build(sp); },
    /** Size on the stage plus the two points a scene cares about: where the animal hitches and where a rider sits. */
    metrics() {
      const b = new THREE.Box3().setFromObject(group); const P = state.parts; const c = b.getCenter(new THREE.Vector3());
      return { length: b.max.x - b.min.x, width: b.max.z - b.min.z, height: b.max.y - b.min.y, center: { x: c.x, y: c.y, z: c.z }, wheelR: (P.wheelR || 0) * state.spec.size, hitch: P.hitch, seat: P.seat, animals: state.animals.length };
    },
    update(dt, t) {
      state.t += dt;
      const rolling = state.anim === 'roll';
      if (rolling) { state.roll += dt * 3.4; for (const w of state.parts.wheels || []) w.rotation.z = -state.roll; }
      if (state.root) { const sway = state.anim === 'dead' ? 0 : (rolling ? 0.02 : 0.006); state.root.rotation.z = Math.sin(t * (rolling ? 7 : 1.6)) * sway; state.root.position.y = rolling ? Math.abs(Math.sin(t * 9)) * 0.012 : 0; }
      for (const g of state.parts.glows || []) g.material.emissiveIntensity = 0.6 + Math.sin(t * 3 + g.position.x) * 0.25;
      for (const a of state.animals) a.ctrl.update(dt, t);
    },
    dispose() { for (const a of state.animals) a.ctrl.dispose(); state.animals = []; clear(); },
  };
}

// ------------------------------------------------------------------ shared pieces
/** One wheel: rim, hub and spokes, standing upright with its axle along z so it rolls along x. */
function wheel(r, wide, C, { solid = false, spiked = false } = {}) {
  const g = new THREE.Group();
  if (solid) { const disc = cyl(r * 0.94, r * 0.94, wide, C.wood, 20); disc.rotation.x = Math.PI / 2; g.add(disc); }
  else {
    const rim = mesh(new THREE.TorusGeometry(r * 0.9, wide * 0.5, 6, 20), C.wood); g.add(rim);      // a torus already lies in the xy plane, axle along z
    for (let i = 0; i < 8; i++) { const sp = box(r * 1.6, 0.045, wide * 0.42, shade(C.wood, 0.1)); sp.rotation.z = (i / 8) * Math.PI; g.add(sp); }
  }
  const tyre = mesh(new THREE.TorusGeometry(r, wide * 0.22, 5, 22), C.metal, { roughness: 0.5, metalness: 0.6 }); g.add(tyre);
  const hub = cyl(r * 0.2, r * 0.2, wide * 1.8, C.metal, 10, { roughness: 0.45, metalness: 0.7 }); hub.rotation.x = Math.PI / 2; g.add(hub);
  if (spiked) for (let i = 0; i < 5; i++) { const sk = mesh(new THREE.ConeGeometry(r * 0.09, r * 0.55, 7), C.metal, { roughness: 0.4, metalness: 0.8 }); sk.rotation.x = Math.PI / 2; sk.position.set(Math.cos(i / 5 * Math.PI * 2) * r * 0.34, Math.sin(i / 5 * Math.PI * 2) * r * 0.34, wide * 1.1); g.add(sk); }
  return g;
}
/** Wheels on both sides of an axle, added to `into`, collected in `wheels`. */
function axle(into, wheels, x, r, wide, axleZ, C, opts = {}) {
  for (const z of [-axleZ, axleZ]) { const w = wheel(r, wide, C, opts); w.position.set(x, r, z); into.add(w); wheels.push(w); }
  const bar = cyl(wide * 0.35, wide * 0.35, axleZ * 2, C.metal, 8, { roughness: 0.5, metalness: 0.6 }); bar.position.set(x, r, 0); into.add(bar);
}
/** The open bed of a cart: floor plus four low sides. */
function bed(into, B, C) {
  const floor = box(B.bedLen, B.bedH, B.bedWide, C.wood); into.add(floor);
  const sh = B.sideH; if (sh > 0) {
    for (const z of [-B.bedWide / 2 + 0.03, B.bedWide / 2 - 0.03]) { const s = box(B.bedLen, sh, 0.06, C.trim); s.position.set(0, sh / 2 + B.bedH / 2, z); into.add(s); }
    for (const x of [-B.bedLen / 2 + 0.03, B.bedLen / 2 - 0.03]) { const s = box(0.06, sh, B.bedWide - 0.06, C.trim); s.position.set(x, sh / 2 + B.bedH / 2, 0); into.add(s); }
    for (let i = 1; i < 4; i++) for (const z of [-B.bedWide / 2, B.bedWide / 2]) { const r = box(0.05, sh * 0.9, 0.05, C.wood); r.position.set(-B.bedLen / 2 + (i / 4) * B.bedLen, sh / 2 + B.bedH / 2, z); into.add(r); }
  }
  return floor;
}
/** Shafts and a yoke bar out the front, and the point where the animal stands. */
function shafts(into, B, C, y) {
  const len = B.shafts; const x0 = B.bedLen / 2;
  for (const z of [-B.bedWide * 0.28, B.bedWide * 0.28]) { const s = box(len, 0.06, 0.06, C.trim); s.position.set(x0 + len / 2, y, z); into.add(s); }
  const yoke = box(0.07, 0.07, B.bedWide * 0.7, C.metal); yoke.position.set(x0 + len, y, 0); into.add(yoke);
  return { x: x0 + len, y, z: 0 };
}
/** Crates, barrels and a bedroll, so a loaded cart does not look empty. */
function cargo(into, B, C, n, y) {
  const rnd = s => { let a = (s * 2654435761) >>> 0; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); };
  const r = rnd(n * 7 + Math.round(B.bedLen * 10));
  for (let i = 0; i < n; i++) {
    const x = -B.bedLen / 2 + ((i + 0.7) / (n + 0.4)) * B.bedLen, z = (r() - 0.5) * B.bedWide * 0.45;
    if (r() < 0.45) { const b = cyl(0.14, 0.16, 0.32, shade(C.wood, -0.18), 12); b.position.set(x, y + 0.16, z); into.add(b); const hoop = cyl(0.165, 0.165, 0.04, C.metal, 12); hoop.position.set(x, y + 0.16, z); into.add(hoop); }
    else { const c = box(0.3, 0.26, 0.3, shade(C.wood, 0.12)); c.position.set(x, y + 0.13, z); c.rotation.y = (r() - 0.5) * 0.5; into.add(c); const strap = box(0.32, 0.05, 0.32, C.trim); strap.position.copy(c.position); strap.rotation.y = c.rotation.y; into.add(strap); }
  }
  const roll = cyl(0.1, 0.1, 0.5, C.cloth, 10); roll.rotation.x = Math.PI / 2; roll.position.set(-B.bedLen / 2 + 0.22, y + 0.1, 0); into.add(roll);
}
/** A driver's bench at the front of the bed. */
function bench(into, B, C, y) {
  const seat = box(0.34, 0.07, B.bedWide * 0.8, C.trim); seat.position.set(B.bedLen / 2 - 0.25, y + 0.3, 0); into.add(seat);
  const back = box(0.07, 0.26, B.bedWide * 0.8, C.trim); back.position.set(B.bedLen / 2 - 0.42, y + 0.45, 0); into.add(back);
  return { x: B.bedLen / 2 - 0.25, y: y + 0.37, z: 0 };
}

// ------------------------------------------------------------------ plans
/** Two wheels, an open bed, shafts: the hand cart and the ox cart. */
function buildCart(root, T, s) {
  const B = T.body, C = s.colors; const wheels = []; const P = { wheels, wheelR: B.wheelR };
  const deck = new THREE.Group(); deck.position.y = B.wheelR + B.bedH / 2 + 0.05; root.add(deck); P.deck = deck;
  bed(deck, B, C);
  axle(root, wheels, 0, B.wheelR, B.wheelWide, B.axleZ, C, { solid: B.solidWheels });
  cargo(deck, B, C, B.cargo || 2, B.bedH / 2);
  P.hitch = shafts(deck, B, C, 0);
  P.seat = { x: -B.bedLen * 0.2, y: deck.position.y + B.bedH, z: 0 };
  return P;
}
/** Four wheels, canvas hoops or iron plates: the covered wagon and the war wagon. */
function buildWagon(root, T, s) {
  const B = T.body, C = s.colors; const wheels = []; const P = { wheels, wheelR: B.wheelRear || B.wheelR };
  const rear = B.wheelRear || B.wheelR;
  const deck = new THREE.Group(); deck.position.y = rear + B.bedH / 2 + 0.04; root.add(deck); P.deck = deck;
  bed(deck, B, C);
  axle(root, wheels, B.bedLen * 0.32, B.wheelR, B.wheelWide, B.axleZ, C, { spiked: B.spikes });
  axle(root, wheels, -B.bedLen * 0.3, rear, B.wheelWide, B.axleZ, C, { spiked: B.spikes });
  cargo(deck, B, C, B.cargo || 2, B.bedH / 2);
  if (B.hoops) {
    const R = B.coverR * B.bedWide;
    for (let i = 0; i < B.hoops; i++) { const h = mesh(new THREE.TorusGeometry(R, 0.022, 6, 18, Math.PI), C.trim); h.position.set(-B.bedLen / 2 + ((i + 0.5) / B.hoops) * B.bedLen, B.sideH + B.bedH / 2, 0); h.rotation.y = Math.PI / 2; deck.add(h); }
    const cover = mesh(new THREE.CylinderGeometry(R, R, B.bedLen * 0.92, 16, 1, true, 0, Math.PI), C.cloth, { side: THREE.DoubleSide, roughness: 1 });
    cover.rotation.z = Math.PI / 2; cover.position.set(0, B.sideH + B.bedH / 2, 0); deck.add(cover);
    for (const x of [-B.bedLen * 0.46, B.bedLen * 0.46]) { const cap = mesh(new THREE.CircleGeometry(R, 16, 0, Math.PI), shade(C.cloth, -0.12), { side: THREE.DoubleSide }); cap.position.set(x, B.sideH + B.bedH / 2, 0); cap.rotation.y = Math.PI / 2; deck.add(cap); }
  }
  if (B.plates) {
    for (const z of [-B.bedWide / 2 - 0.04, B.bedWide / 2 + 0.04]) {
      const plate = box(B.bedLen * 0.9, B.sideH * 0.85, 0.05, C.metal); plate.material = metalMat(C.metal); plate.position.set(0, B.sideH * 0.55 + B.bedH / 2, z); deck.add(plate);
      for (let i = 0; i < 6; i++) { const rivet = sphere(0.025, shade(C.metal, 0.25)); rivet.position.set(-B.bedLen * 0.38 + (i / 5) * B.bedLen * 0.76, B.sideH * 0.55 + B.bedH / 2, z + (z > 0 ? 0.03 : -0.03)); deck.add(rivet); }
    }
    for (let i = 0; i < (B.shields || 0); i++) { const sh = cyl(0.17, 0.17, 0.04, C.cloth, 14); sh.rotation.x = Math.PI / 2; sh.position.set(-B.bedLen * 0.25 + i * 0.42, B.sideH * 0.7 + B.bedH / 2, B.bedWide / 2 + 0.09); deck.add(sh); const boss = sphere(0.05, C.metal); boss.position.copy(sh.position); boss.position.z += 0.03; deck.add(boss); }
  }
  P.seat = B.bench ? bench(deck, B, C, B.bedH / 2) : { x: 0, y: deck.position.y, z: 0 };
  P.hitch = shafts(deck, B, C, -B.bedH);
  return P;
}
/** A closed cabin on four wheels with lanterns: the coach. */
function buildCoach(root, T, s) {
  const B = T.body, C = s.colors; const wheels = []; const P = { wheels, wheelR: B.wheelRear, glows: [] };
  const deck = new THREE.Group(); deck.position.y = B.wheelRear * 0.9; root.add(deck); P.deck = deck;
  const cabin = box(B.bedLen, B.cabinH, B.bedWide, C.wood); cabin.position.y = B.cabinH / 2; deck.add(cabin);
  const roof = box(B.bedLen * 1.04, 0.07, B.bedWide * 1.06, C.trim); roof.position.y = B.cabinH + 0.03; deck.add(roof);
  if (B.roofRail) for (const z of [-B.bedWide / 2, B.bedWide / 2]) { const rail = box(B.bedLen * 0.9, 0.05, 0.04, C.trim); rail.position.set(0, B.cabinH + 0.11, z); deck.add(rail); }
  for (const z of [-B.bedWide / 2 - 0.01, B.bedWide / 2 + 0.01]) {
    const win = box(B.bedLen * 0.42, B.cabinH * 0.36, 0.03, '#161b22'); win.position.set(0.05, B.cabinH * 0.62, z); deck.add(win);
    const frame = box(B.bedLen * 0.46, B.cabinH * 0.42, 0.02, C.trim); frame.position.set(0.05, B.cabinH * 0.62, z + (z > 0 ? -0.02 : 0.02)); deck.add(frame);
    const door = box(B.bedLen * 0.3, B.cabinH * 0.52, 0.02, shade(C.wood, -0.12)); door.position.set(-0.22, B.cabinH * 0.3, z); deck.add(door);
  }
  axle(root, wheels, B.bedLen * 0.42, B.wheelR, B.wheelWide, B.axleZ, C);
  axle(root, wheels, -B.bedLen * 0.38, B.wheelRear, B.wheelWide, B.axleZ, C);
  if (B.lanterns) for (const z of [-B.bedWide * 0.42, B.bedWide * 0.42]) {
    const post = box(0.04, 0.2, 0.04, C.metal); post.position.set(B.bedLen / 2 + 0.05, B.cabinH * 0.78, z); deck.add(post);
    const lamp = mesh(new THREE.BoxGeometry(0.12, 0.16, 0.12), C.cloth, { emissive: new THREE.Color(C.cloth), emissiveIntensity: 0.8, roughness: 0.4 });
    lamp.position.set(B.bedLen / 2 + 0.05, B.cabinH * 0.92, z); deck.add(lamp); P.glows.push(lamp);
  }
  P.seat = bench(deck, { ...B, bedH: 0 }, C, B.cabinH * 0.92);
  P.hitch = shafts(deck, B, C, 0.1);
  return P;
}
/** Runners instead of wheels, faintly lit: the dragon sled. */
function buildSled(root, T, s) {
  const B = T.body, C = s.colors; const P = { wheels: [], wheelR: 0, glows: [] };
  const deck = new THREE.Group(); deck.position.y = B.runnerR * 2.6; root.add(deck); P.deck = deck;
  bed(deck, B, C);
  for (const z of [-B.axleZ, B.axleZ]) {
    const runner = box(B.bedLen * 1.15, B.runnerR * 0.5, B.runnerR * 0.8, C.metal); runner.material = metalMat(C.metal); runner.position.set(0, B.runnerR * 0.4, z); root.add(runner);
    const tip = mesh(new THREE.ConeGeometry(B.runnerR * 0.45, B.runnerR * 1.6, 8), C.metal, { roughness: 0.4, metalness: 0.8 }); tip.rotation.z = -Math.PI / 2; tip.position.set(B.bedLen * 0.62, B.runnerR * 0.75, z); root.add(tip);
    for (const x of [-B.bedLen * 0.3, B.bedLen * 0.3]) { const strut = box(0.06, B.runnerR * 2.2, 0.06, C.trim); strut.position.set(x, B.runnerR * 1.5, z); root.add(strut); }
  }
  cargo(deck, B, C, B.cargo || 2, B.bedH / 2);
  if (B.glow) for (const x of [-B.bedLen * 0.4, 0, B.bedLen * 0.4]) {
    const rune = mesh(new THREE.OctahedronGeometry(0.08, 0), C.trim, { emissive: new THREE.Color(C.trim), emissiveIntensity: 0.8, roughness: 0.4 });
    rune.position.set(x, B.sideH + B.bedH, B.bedWide / 2); deck.add(rune); P.glows.push(rune);
  }
  P.seat = { x: -B.bedLen * 0.2, y: deck.position.y + B.bedH, z: 0 };
  P.hitch = shafts(deck, B, C, 0);
  return P;
}
/** No cart: packs and crates roped onto the animal's back. */
function buildPack(root, T, s) {
  const B = T.body, C = s.colors; const P = { wheels: [], wheelR: 0, hitch: { x: 0, y: 0, z: 0 }, seat: { x: 0, y: 0.9, z: 0 }, animalAt: { x: 0, z: 0 } };
  // The packs ride on the animal, which createVehicle() parks at the hitch — build them around that point.
  const packs = new THREE.Group(); packs.position.set(-B.packLen * 0.15, 1.0, 0); root.add(packs); P.deck = packs;
  for (const z of [-0.26, 0.26]) { const p = box(B.packLen, B.packR * 1.6, B.packR, C.cloth); p.position.set(0, -0.06, z); packs.add(p); const strap = box(B.packLen * 0.25, B.packR * 1.8, B.packR * 1.1, C.trim); strap.position.set(0, -0.06, z); packs.add(strap); }
  const blanket = box(B.packLen * 1.2, 0.05, 0.56, shade(C.cloth, -0.2)); packs.add(blanket);
  for (let i = 0; i < (B.cargo || 2); i++) { const c = box(0.2, 0.18, 0.2, shade(C.wood, 0.1)); c.position.set(-B.packLen * 0.3 + i * 0.22, 0.13, 0); c.rotation.y = i * 0.4; packs.add(c); }
  const roll = cyl(0.08, 0.08, 0.5, C.cloth, 10); roll.rotation.x = Math.PI / 2; roll.position.set(-B.packLen * 0.45, 0.1, 0); packs.add(roll);
  return P;
}
