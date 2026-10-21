// Things in the world you can walk up to and use, plus the arena objects of a boss fight.
//
//   room objects   kind:'object' entities with info.type portal / stairs / exit / chest   (protocol §10)
//   arena objects  `obj {id, state, type?, x?, z?, r?, key?, hp?, gone?}` events: brazier, lever, pillar,
//                  pool, rock (js/rules/encounter.js)
//
// Each gets a model from the kit, and the usable ones a pulsing gold ring on the ground and a soft glow so
// they stand out from the scenery ("environment highlights"). The nearest usable one within reach shows a
// prompt ("E  Enter the Barrow"); E sends `use {id}` and the server answers with `used` (or a handoff).

import * as THREE from 'three';
import { buildProp, buildRock } from '../../../../highdef-3d/js/kit/rocks.js';
import { makeGlowTexture } from './decor.js';
import { LIGHTS } from './lightpool.js';
import { usePropKind } from '../sim/vignettes.js';
import { boxSize } from './box-size.js';

const REACH = 4;
const KINDS = {
  portal:  { prop: 'ruined_arch', glow: '#8f7dff', label: o => `Enter ${o.name || 'the dungeon'}`, use: true, scale: 1.2 },
  stairs:  { prop: 'stone_step', glow: '#ffd38a', label: o => o.name || 'Take the stairs', use: true, stack: 3 },
  exit:    { prop: 'ruined_arch', glow: '#7fe0a0', label: o => o.name || 'Leave the dungeon', use: true },
  chest:   { prop: o => (o.look === 'stump' ? null : 'crate'),   /* a road-event chest is dressed by its `look` (chestDress) */ glow: '#ffcf4a', label: o => (o.opened ? 'Empty' : `Open ${o.name || 'the chest'}`), use: o => !o.opened, tint: '#c99a3a', scale: 1.25 },
  // play-test 6 (U10/U12): the way you came in is a DOORWAY with daylight in it (no portal swirl), the stair up is a flight of steps
  door:     { prop: null, glow: null, label: o => o.name || 'The way you came in', use: true, doorway: true },
  entrance: { prop: null, glow: null, label: o => o.name || 'Dungeon entrance', use: true, doorway: true },
  lift:     { prop: 'stone_step', glow: '#ffd38a', label: o => o.name || 'Stairs up', use: true, stack: 5, scale: 1.15 },
  brazier: { prop: 'fire_ring', glow: '#ff9a3d', label: o => (o.state === 'lit' ? 'Burning' : 'Light the brazier'), use: o => o.state !== 'lit' },
  lever:   { prop: null, glow: '#ffd38a', label: o => (o.state === 'used' ? 'Pulled' : 'Pull the lever'), use: o => o.state !== 'used' },
  pillar:  { prop: 'ruined_pillar', glow: null, label: () => null, use: false },
  rock:    { prop: 'boulder', rock: true, glow: null, label: () => null, use: false },
  pool:    { prop: null, glow: '#7ee04a', label: () => null, use: false },
  cracked_floor: { prop: null, glow: null, label: () => null, use: false, decal: '#2a2420' },
  sarcophagus: { prop: 'stone_step', glow: null, label: () => null, use: false, scale: 1.4, tint: '#8f8a82' },
  support_beam: { prop: 'fence_post', glow: null, label: () => null, use: false, scale: 2.2 },
  ore_cart: { prop: 'cart_wheel', glow: null, label: () => null, use: false, scale: 1.3 },
  gate:    { prop: null, glow: null, label: () => null, use: false },
  // M2: the living world
  waystone: { prop: 'rune_stone', glow: '#7fd7ff', label: () => 'Touch the waystone', use: true, scale: 1.35, light: '#7fd7ff' },
  note:    { prop: 'stone_marker', glow: '#f3e3b0', label: o => `Read: ${o.name || 'a note'}`, use: true, scale: 0.8 },
  use:     { prop: o => (o.bare ? null : usePropKind(o.name))   /* #63: `bare` = the place already draws it (two wells on top of each other) */, glow: '#c9a8ff', label: o => o.name || 'Use', use: true },
  grave:   { prop: 'stone_marker', glow: null, label: o => `${o.name || 'A grave'}`, use: true, tint: '#8a8780', mound: true },
  campfire: { prop: 'campfire', glow: '#ffae5c', label: o => o.name || 'A campfire', use: true, fire: true },
  // [Packs] a wild event's rift (js/sim/wild-events.js): it can only be touched while it FALTERS (a wave is down) — then E sets a seal
  rift: { prop: null, glow: '#b26bff', label: o => (o.state === 'faltering' ? 'Set a seal on the rift' : null), use: o => o.state === 'faltering', light: '#b26bff', rift: true },
  npc:     { prop: null, glow: null, label: o => `Talk to ${o.name || 'them'}`, use: true, invisible: true },
  vignette: { prop: null, glow: null, label: () => null, use: false, invisible: true },
  cart:    { prop: null, glow: null, label: o => (o.name && !/^cart$/i.test(o.name) ? `Ask about a ride: ${o.name}` : 'Ask about a ride on the ox cart'), use: true, invisible: true },   // W5: drawn by carts-view.js
  // round 11 (P, live #12): a fish pool is the ONLY place to fish — E on it casts (drawn on the water by angling-view.js). Its
  // own `reach`: a pool lies off the bank, so the prompt shows from the shore (the server allows 16 m; this is 12 + r/2)
  fishpool: { prop: null, glow: null, label: () => 'Fish here', use: true, invisible: true, reach: 12 },
  // W9 (P-client): gathering nodes and skinnable corpses — drawn by prof-view.js, which also sets `verb` and `spent`; E starts the mini-game (main.js onUse)
  node:     { prop: null, glow: null, label: o => (o.spent ? null : `${o.verb || 'Gather'} ${o.name || 'this'}`), use: o => !o.spent, invisible: true },
  skin:     { prop: null, glow: null, label: o => `Skin ${o.name || 'the beast'}${o.nearby > 0 ? ` and ${o.nearby} more nearby` : ''}`,      /* #69: E skins them one after another */ use: true, invisible: true },        // T25: drawn on the water by angling-view.js
  // stream E's placed content (js/sim/placements.js): the place itself is drawn by site-view.js
  fort:    { prop: null, glow: null, label: () => null, use: false, invisible: true },
  farm:    { prop: null, glow: null, label: () => null, use: false, invisible: true },
  hook:    { prop: null, glow: null, label: () => null, use: false, invisible: true },
  clue:    { prop: o => (/carv|stone|mark/i.test(o.name || '') ? 'stone_marker' : 'crate'), glow: '#f3e3b0', label: o => `Examine: ${o.name || 'a clue'}`, use: true, scale: 0.7 },
  cache:   { prop: 'crate', glow: '#ffd56a', label: o => (o.opened ? 'Dug up' : `Dig up ${o.name || 'the cache'}`), use: o => !o.opened, tint: '#7a5a2a', hiddenAlways: true },
};

// R7 (play-test 3): arena objects that say what the call-out says — `info.look = 'chained'` puts an iron shackle band on
// the pillar, `info.tether = <entity id>` hangs a chain of links from it to that body (the Chained Saint) until the
// object's state is `broken`. Links are one InstancedMesh per chain (shared geometry and material).
const LINKS = 26;
let linkGeo = null, linkMat = null;
export function chainLinks(a, b, n = LINKS) {
  // pure: n link centres along a slack chain from a to b (a catenary-ish sag), each with the direction it runs. Exported for tests.
  const out = [], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz) || 1, sag = Math.min(1.6, len * 0.12);
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; out.push({ x: a.x + dx * t, y: a.y + dy * t - Math.sin(Math.PI * t) * sag, z: a.z + dz * t, len }); }
  return out;
}
/**
 * Wrap-up (#59's siblings): what a road-event chest is, by the `look` its record names (data/provinces/road-events.json).
 * Every one of them used to be the same crate — the "Wrecked Cart" had no cart, the "Hollow Stump Hoard" no stump.
 * CHEST_LOOKS lists, per look, kit props `[id, x, y, z, rotX, rotY, rotZ, scale]` and plain shapes; a look not listed
 * here (chest_iron, chest_small) is honestly a box. Exported for tests.
 */
export const CHEST_LOOKS = {
  cart_wreck: { props: [['cart_wheel', 1.25, 0.12, 0.5, Math.PI / 2, 0.4, 0, 1.2], ['cart_wheel', -1.05, 0.0, -0.35, 0, 0.3, 0.35, 1.2], ['fence_rail', 0.2, 0.25, 1.15, 0, 1.2, 0.18, 1], ['fence_rail', -0.4, 0.1, -1.15, 0, 1.75, -0.1, 1], ['crate', 0.85, 0, -0.75, 0, 0.7, 0, 0.7]],
    shapes: [{ box: [2.3, 0.1, 1.3], at: [0, 0.42, 0.1], rot: [0.05, 0.2, 0.42], colour: '#6e553d' }] },
  cache_dug: { sink: 0.3, shapes: [{ ball: [1, 0.3, 0.8], at: [1.0, 0, 0.35], colour: '#4a3d2e' }, { ball: [0.7, 0.22, 0.6], at: [-0.85, 0, -0.5], colour: '#54452f' }, { disc: 1.25, at: [0, 0.03, 0], colour: '#3b3024' },
    { box: [0.07, 1.0, 0.07], at: [1.15, 0.5, -0.5], rot: [0.25, 0, -0.3], colour: '#6e553d' }, { box: [0.3, 0.34, 0.03], at: [1.3, 0.12, -0.62], rot: [0.25, 0, -0.3], colour: '#7c8088' }] },
  stump: { shapes: [{ cyl: [0.62, 0.78, 0.85, 9], at: [0, 0.42, 0], colour: '#5a4632' }, { cyl: [0.5, 0.5, 0.04, 9], at: [0, 0.85, 0], colour: '#2a2018' }, { box: [0.9, 0.16, 0.2], at: [0.75, 0.08, 0.2], rot: [0, 0.5, 0], colour: '#5a4632' },
    { box: [0.7, 0.14, 0.18], at: [-0.6, 0.07, -0.5], rot: [0, -0.9, 0], colour: '#4e3c2a' }, { ball: [0.2, 0.14, 0.2], at: [0.1, 0.9, 0.05], colour: '#b08a3a' }] },
  packs: { sink: 0.2, shapes: [{ ball: [0.5, 0.3, 0.36], at: [0.95, 0.26, 0.3], rot: [0, 0.4, 0.15], colour: '#7a5a3a' }, { ball: [0.46, 0.28, 0.34], at: [-0.9, 0.24, -0.25], rot: [0, -0.7, -0.1], colour: '#6b4e32' },
    { ball: [0.34, 0.24, 0.3], at: [0.2, 0.2, 1.05], colour: '#b59a62' }, { box: [1.7, 0.03, 0.12], at: [0.05, 0.05, 0.05], rot: [0, 0.35, 0], colour: '#3a2a1c' }, { box: [0.5, 0.04, 0.4], at: [-0.5, 0.03, 0.9], rot: [0, 0.9, 0], colour: '#8a2f2a' }] },
  // [W] Vharlen's road-event chests (data/provinces/vharlen-road-events.json): a tipped sulphur cart, a holed outrigger,
  // a strongbox half under the ash, a cold kiln with a cache in its mouth — the island's colours, plain shapes only
  sulphur_cart: { shapes: [{ box: [2.0, 0.08, 1.1], at: [0, 0.55, -0.2], rot: [1.2, 0.15, 0], colour: '#7d6d58' }, { box: [2.0, 0.42, 0.07], at: [0, 0.2, 0.4], rot: [0, 0.15, 0], colour: '#5f5242' },
    { cyl: [0.55, 0.55, 0.08, 10], at: [1.15, 0.55, -0.55], rot: [0, 0.15, 1.57], colour: '#5f5242' }, { ball: [0.9, 0.25, 0.6], at: [0.2, 0.08, 0.95], colour: '#e0c437' }, { ball: [0.4, 0.16, 0.3], at: [-0.9, 0.06, 1.2], colour: '#c4a62a' }] },
  outrigger_wreck: { shapes: [{ box: [4.4, 0.45, 0.8], at: [0, 0.22, -0.6], rot: [0.35, 0.1, 0], colour: '#5f5242' }, { box: [4.2, 0.05, 0.6], at: [0, 0.47, -0.55], rot: [0.35, 0.1, 0], colour: '#2c2622' },
    { cyl: [0.1, 0.1, 2.8, 6], at: [0.2, 0.12, 1.25], rot: [0, 0.1, 1.57], colour: '#7d6d58' }, { box: [0.08, 0.08, 2.0], at: [-1.0, 0.3, 0.4], colour: '#6c5944' }, { ball: [0.16, 0.16, 0.16], at: [1.3, 0.14, 0.8], colour: '#3f8a62' }] },
  ash_buried: { sink: 0.3, shapes: [{ ball: [1.4, 0.38, 1.1], at: [0, 0, 0], colour: '#8d8883' }, { ball: [0.7, 0.24, 0.6], at: [1.1, 0, -0.6], colour: '#a39e98' }, { disc: 1.6, at: [0, 0.02, 0], colour: '#77726d' },
    { box: [0.9, 0.6, 0.12], at: [-0.9, 0.3, 0.7], rot: [0.3, 0.4, 0.1], colour: '#9a4a2c' }] },
  kiln_cache: { shapes: [{ ball: [1.15, 1.5, 1.15], at: [0, 0, -1.3], colour: '#3b383b' }, { box: [0.8, 0.7, 0.3], at: [0, 0.35, -0.2], colour: '#141214' }, { cyl: [0.2, 0.18, 0.6, 6], at: [0, 1.7, -1.3], colour: '#2f2d30' },
    { ball: [0.3, 0.2, 0.3], at: [-0.9, 0.1, 0.4], colour: '#3f8a62' }, { ball: [0.22, 0.18, 0.22], at: [0.9, 0.1, 0.5], colour: '#c58b2c' }] },
};
const dressMats = new Map();
function chestDress(look, root, geo, mat) {
  const L = CHEST_LOOKS[look]; if (!L) return;
  if (L.sink) for (const m of root.children) m.position.y -= L.sink;                    // the box sits IN the hole / under the bags
  const put = (m, at, rot) => { m.position.set(at[0], at[1], at[2]); if (rot) m.rotation.set(rot[0], rot[1], rot[2]); m.castShadow = m.receiveShadow = true; root.add(m); };
  for (const [id, x, y, z, rx, ry, rz, sc] of L.props || []) { const g = geo(id); if (!g) continue; const m = new THREE.Mesh(g, mat); m.scale.setScalar(sc || 1); put(m, [x, y, z], [rx, ry, rz]); }
  for (const sh of L.shapes || []) {
    if (!dressMats.has(sh.colour)) dressMats.set(sh.colour, new THREE.MeshStandardMaterial({ color: sh.colour, roughness: 0.95, flatShading: true }));
    const g = sh.box ? new THREE.BoxGeometry(...sh.box) : sh.cyl ? new THREE.CylinderGeometry(...sh.cyl) : sh.disc ? new THREE.CircleGeometry(sh.disc, 14).rotateX(-Math.PI / 2) : new THREE.SphereGeometry(1, 8, 5).scale(...sh.ball);
    put(new THREE.Mesh(g, dressMats.get(sh.colour)), sh.at, sh.rot);
  }
}

export function createObjects(scene, { heightAt = () => 0, onUse, onNear = null, labelLayer = null, camera = null, posOf = () => null } = {}) {
  const items = new Map();       // id -> object
  const group = new THREE.Group(); group.name = 'objects'; scene.add(group);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const ringGeo = new THREE.RingGeometry(0.9, 1.0, 48); ringGeo.rotateX(-Math.PI / 2);
  const glowTex = makeGlowTexture();
  const geoCache = new Map();
  const geo = (id, rock) => { const k = id + (rock ? '#r' : ''); if (!geoCache.has(k)) { try { geoCache.set(k, rock ? buildRock(id, { seed: 3, lod: 1, size: 2 }).geometry : buildProp(id, { seed: 3, lod: 0 }).geometry); } catch { geoCache.set(k, null); } } return geoCache.get(k); };
  let ground = heightAt;
  let focus = null;
  const prompt = document.getElementById('interact');

  function model(o) {
    const K = KINDS[o.type] || {};
    const root = new THREE.Group();
    const propId = typeof K.prop === 'function' ? K.prop(o) : K.prop;
    if (K.invisible) return root;
    if (o.hidden || K.hiddenAlways) { o.hiddenChest = true; o.shimmerR = o.shimmer || 15; }
    const g = propId ? geo(propId, K.rock) : null;
    if (g) {
      const n = K.stack || 1;
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(g, K.tint ? mat.clone() : mat);
        if (K.tint) m.material.color.set(K.tint);
        m.position.set(0, i * 0.18, -i * 0.35); m.castShadow = m.receiveShadow = true;
        root.add(m);
      }
      root.scale.setScalar(K.scale || 1);
    } else if (K.rift) {
      // [Packs] a standing tear: two crossed rings of violet light round a dark core, spinning; it flickers gold while it falters
      const ringMat = new THREE.MeshBasicMaterial({ color: '#c08aff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const coreMat = new THREE.MeshBasicMaterial({ color: '#1a0830', transparent: true, opacity: 0.9, side: THREE.DoubleSide });
      const spin = new THREE.Group(); spin.position.y = 2.1; root.add(spin);
      for (const ry of [0, Math.PI / 2]) { const t = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.09, 8, 40), ringMat); t.rotation.y = ry; spin.add(t); }
      const core = new THREE.Mesh(new THREE.CircleGeometry(1.25, 28), coreMat); spin.add(core);
      const scorch = new THREE.Mesh(new THREE.CircleGeometry(2.8, 24), new THREE.MeshBasicMaterial({ color: '#2a1638', transparent: true, opacity: 0.6, depthWrite: false })); scorch.rotation.x = -Math.PI / 2; scorch.position.y = 0.05; root.add(scorch);
      o.riftSpin = spin; o.riftRing = ringMat;
    } else if (o.type === 'lever') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.5), new THREE.MeshStandardMaterial({ color: '#5a4a3a', roughness: 0.9 }));
      base.position.y = 0.17; root.add(base);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0), new THREE.MeshStandardMaterial({ color: '#8a8f99', metalness: 0.6, roughness: 0.4 }));
      arm.geometry.translate(0, 0.5, 0); arm.position.y = 0.3; arm.rotation.z = 0.6; root.add(arm); o.arm = arm;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshStandardMaterial({ color: '#b03a2a' })); knob.position.y = 1.0; arm.add(knob);
    } else if (K.doorway) {
      // two stone jambs and a lintel, a pale slab of daylight between them and three steps climbing into it
      const stone = new THREE.MeshStandardMaterial({ color: '#7d776c', roughness: 0.95 });
      for (const sx of [-1, 1]) { const j = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.0, 0.6), stone); j.position.set(sx * 1.15, 1.5, 0); j.castShadow = true; root.add(j); }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.5, 0.7), stone); lintel.position.set(0, 3.2, 0); lintel.castShadow = true; root.add(lintel);
      for (let i = 0; i < 3; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.22, 0.5), stone); st.position.set(0, 0.11 + i * 0.22, 0.75 - i * 0.5); st.receiveShadow = true; root.add(st); }
      const day = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.9), new THREE.MeshBasicMaterial({ color: '#fff3cf', transparent: true, opacity: 0.85, side: THREE.DoubleSide, fog: false }));
      day.position.set(0, 1.5, -0.2); root.add(day); o.daylight = day;
    } else if (o.type === 'pool') {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(o.r || 3, 40), new THREE.MeshBasicMaterial({ color: K.glow, transparent: true, opacity: 0.45, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = 0.06; root.add(disc);
    }
    if (o.type === 'chest' && o.look) chestDress(o.look, root, geo, mat);
    if (K.glow) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: K.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
      s.position.y = o.type === 'portal' || o.type === 'exit' ? 1.8 : 0.9; s.scale.setScalar(o.type === 'portal' ? 4.2 : 2.2);
      root.add(s); o.glow = s;
    }
    if (K.use) {
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: K.glow || '#ffd38a', transparent: true, opacity: 0.5, depthWrite: false }));
      ring.position.y = 0.07; ring.scale.setScalar(Math.max(1.1, (o.r || 1) + 0.6)); ring.renderOrder = 2; root.add(ring); o.ring = ring;
    }
    if (K.mound) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#4a3d2e', roughness: 1 }));
      m.scale.set(0.8, 0.28, 1.5); m.position.set(0, 0, 1.2); root.add(m);
    }
    if (K.decal) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(o.r || 2.6, 24), new THREE.MeshBasicMaterial({ color: K.decal, transparent: true, opacity: 0.7, depthWrite: false }));
      d.rotation.x = -Math.PI / 2; d.position.y = 0.05; root.add(d);
    }
    if (K.fire || K.light) {
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: K.fire ? '#ffb35a' : K.light, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      fl.position.y = K.fire ? 0.7 : 1.6; fl.scale.set(K.fire ? 1.4 : 1.6, K.fire ? 2.0 : 2.6, 1); root.add(fl); o.flame2 = fl;
      o.light = LIGHTS.add({ x: 0, y: 1.2, z: 0, follow: root, color: K.fire ? '#ffae5c' : K.light, intensity: K.fire ? 16 : 8, distance: K.fire ? 14 : 9, decay: 1.6, flicker: K.fire ? 0.1 : 0 });
    }
    if (o.look === 'chained') {
      // an iron band round the pillar with a ring for the chain, high up where a chain would be fixed
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 6, 18), new THREE.MeshStandardMaterial({ color: '#3a3a40', metalness: 0.7, roughness: 0.45 }));
      band.rotation.x = Math.PI / 2; band.position.y = 2.1; root.add(band);
      const ringO = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 6, 12), band.material); ringO.position.set(0, 2.1, 0.7); root.add(ringO);
      if (!linkGeo) { linkGeo = new THREE.TorusGeometry(0.12, 0.035, 5, 10); linkMat = new THREE.MeshStandardMaterial({ color: '#4a4a52', metalness: 0.75, roughness: 0.4 }); }
      const chain = new THREE.InstancedMesh(linkGeo, linkMat, LINKS); chain.frustumCulled = false; chain.castShadow = true; chain.visible = false;
      scene.add(chain); o.chain = chain;
    }
    if (o.type === 'brazier') {
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffb35a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      fl.position.y = 0.8; fl.scale.set(1.2, 1.8, 1); root.add(fl); o.flame = fl;
    }
    return root;
  }

  /** Add or update. `o` = { id, type, name?, x, z, yaw?, r?, state?, opened?, source: 'room'|'arena' }. */
  function upsert(o) {
    let cur = items.get(o.id);
    if (cur && o.type && cur.type !== o.type) { remove(o.id); cur = null; }
    if (!cur) {
      if (!o.type || o.x === undefined) return null;
      cur = { ...o, t: Math.random() * 6 };
      cur.root = model(cur);
      group.add(cur.root);
      items.set(o.id, cur);
    } else Object.assign(cur, Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)));
    cur.root.position.set(cur.x, ground(cur.x, cur.z), cur.z);
    cur.root.rotation.y = cur.yaw || 0;
    if (cur.type === 'pillar') cur.root.visible = cur.state !== 'broken';
    return cur;
  }
  function remove(id) { const o = items.get(id); if (!o) return; group.remove(o.root); if (o.chain) scene.remove(o.chain); if (o.light) o.light.remove(); if (o.labelEl) o.labelEl.remove(); items.delete(id); if (focus === o) focus = null; }
  function clear() { for (const id of [...items.keys()]) remove(id); }

  /** `obj` event from an encounter. */
  function onObj(ev) {
    if (ev.gone) { remove(ev.id); return; }
    upsert({ id: ev.id, type: ev.otype || (ev.type !== 'obj' ? ev.type : undefined), x: ev.x, z: ev.z, r: ev.r, state: ev.state, hp: ev.hp, key: ev.key, look: ev.look, tether: ev.tether, source: 'arena' });
  }

  function usable(o) { const K = KINDS[o.type]; if (!K) return false; if (o.hiddenChest && !o.revealed) return false; return typeof K.use === 'function' ? K.use(o) : !!K.use; }

  function update(dt, me) {
    let best = null, bd = Infinity;
    for (const o of items.values()) {
      o.t += dt;
      if (o.hiddenChest && me) {
        // a hidden cache shimmers within 15 m (PLAN §3.7) and is invisible further away
        const d = Math.hypot(o.x - me.x, o.z - me.z);
        o.revealed = d < (o.shimmerR || 15);
        o.root.visible = o.revealed;
        if (o.revealed && o.glow) o.glow.scale.setScalar(1.6 + Math.sin(o.t * 6) * 0.4);
      }
      if (o.flame2) o.flame2.material.rotation = Math.sin(o.t * 6) * 0.08;
      if ((o.type === 'vignette' || o.type === 'hook') && me && o.lore && onNear) { if (Math.hypot(o.x - me.x, o.z - me.z) < (o.r || 10)) onNear(o); }
      const K = KINDS[o.type] || {};
      const can = usable(o);
      if (o.ring) { o.ring.visible = can; o.ring.material.opacity = 0.32 + Math.sin(o.t * 3) * 0.16 + (o === focus ? 0.35 : 0); o.ring.rotation.y += dt * 0.4; }
      if (o.glow) o.glow.material.opacity = (can || !K.use ? 0.55 : 0.12) + Math.sin(o.t * 2.2) * 0.15 + (o === focus ? 0.25 : 0);
      if (o.flame) o.flame.visible = o.state === 'lit';
      if (o.chain) {
        const tp = o.tether != null && o.state !== 'broken' && o.root.visible ? posOf(o.tether) : null;
        o.chain.visible = !!tp;
        if (tp) {
          const yaw = Math.atan2(tp.x - o.x, tp.z - o.z);
          const a = { x: o.x + Math.sin(yaw) * 0.7, y: o.root.position.y + 2.1, z: o.z + Math.cos(yaw) * 0.7 };
          const b = { x: tp.x, y: tp.y + (tp.h || 1.6) * 0.55, z: tp.z };
          const pts = chainLinks(a, b);
          for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            _q.setFromEuler(_e.set(i % 2 ? Math.PI / 2 : 0, yaw + Math.PI / 2, 0, 'YXZ'));
            o.chain.setMatrixAt(i, _mm.compose(_vv.set(p.x, p.y, p.z), _q, _ss.set(1, 1, Math.max(0.6, Math.min(2.2, p.len / LINKS / 0.2)))));
          }
          o.chain.instanceMatrix.needsUpdate = true;
        }
      }
      if (o.riftSpin) {      // [Packs] the rift turns; faltering it shudders and goes gold; closed it shrinks away
        o.riftSpin.rotation.y += dt * (o.state === 'faltering' ? 4 : 1.2);
        const k = o.state === 'closed' ? Math.max(0, (o.riftScale ?? 1) - dt * 0.8) : 1 + (o.state === 'faltering' ? Math.sin(o.t * 18) * 0.08 : Math.sin(o.t * 2) * 0.04);
        o.riftScale = k; o.riftSpin.scale.setScalar(k);
        o.riftRing.color.set(o.state === 'faltering' ? '#ffd27a' : '#c08aff');
      }
      if (o.arm) o.arm.rotation.z += ((o.state === 'used' ? -0.6 : 0.6) - o.arm.rotation.z) * Math.min(1, dt * 8);
      if (me && can) { const d = Math.hypot(o.x - me.x, o.z - me.z) - (o.r || 1) * 0.5; if (d < (K.reach || REACH) && d < bd) { bd = d; best = o; } }      // (round 11: a kind may carry its own reach — the fish pool)
    }
    focus = best;
    if (labelLayer && camera) drawLabels();
    if (prompt) {
      const text = best ? (KINDS[best.type]?.label(best) || '') : '';
      prompt.hidden = !text;
      if (text) prompt.querySelector('span').textContent = text;
    }
  }

  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _mm = new THREE.Matrix4(), _vv = new THREE.Vector3(), _ss = new THREE.Vector3();
  // floating labels for objects that carry a story: "Cleared by Aldra's party, 4 minutes ago" on a door
  const _v = new THREE.Vector3();
  function drawLabels() {
    const { w, h } = boxSize(labelLayer);      // 2026-10-20: no layout read per frame (box-size.js)
    for (const o of items.values()) {
      const text = o.banner ? `Cleared by ${o.banner.by}${o.banner.party > 1 ? "'s party" : ''}, ${agoText(o.banner.at)}` : null;
      if (!text) { if (o.labelEl) { o.labelEl.remove(); o.labelEl = null; } continue; }
      if (!o.labelEl) { o.labelEl = document.createElement('div'); o.labelEl.className = 'obj-label'; labelLayer.appendChild(o.labelEl); }
      _v.set(o.x, o.root.position.y + 4.6, o.z);
      const dist = camera.position.distanceTo(_v);
      _v.project(camera);
      const show = _v.z < 1 && dist < 60 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
      o.labelEl.style.display = show ? '' : 'none';
      if (!show) continue;
      o.labelEl.textContent = text;
      o.labelEl.style.transform = `translate(${((_v.x * 0.5 + 0.5) * w).toFixed(0)}px, ${((-_v.y * 0.5 + 0.5) * h).toFixed(0)}px) translate(-50%, -100%)`;
    }
  }
  const agoText = at => { const m = Math.round((Date.now() - at) / 60000); return m < 1 ? 'just now' : m === 1 ? 'a minute ago' : m < 60 ? `${m} minutes ago` : `${Math.round(m / 60)} hours ago`; };

  /** E pressed: use the focused object. */
  function useFocus() { if (focus && usable(focus)) { onUse?.(focus.id, focus); return true; } return false; }

  return {
    items, upsert, remove, clear, onObj, update, useFocus,
    get focus() { return focus; },
    setGround(f) { ground = f; for (const o of items.values()) o.root.position.y = ground(o.x, o.z); },
    markOpened(id) { const o = items.get(id); if (o) o.opened = true; },
  };
}
