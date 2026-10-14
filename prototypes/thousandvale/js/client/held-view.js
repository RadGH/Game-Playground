// What HOLDS a road-event captive (report #59: "the 'caged scout' quest did not involve a cage at all").
//
// The Caged Scout was a person sitting on the grass with guards round them. The rescue's record now says
// `held: 'cage'` (data/provinces/road-events.json), the server puts `held: { kind, x, z, open? }` in that NPC's info
// (js/sim/roadevents.js), and this draws it: a timber-and-iron cage standing where the event put the captive, with a
// barred door and a padlock. The door swings open when the captive is freed — the server says so with `open` for anyone
// who arrives later, and for everyone already there it opens the moment the captive steps out of it. The cage stays
// where it stood and goes when the event's NPC does.
//
//   const held = createHeld(scene, { groundY, compile })
//   held.set(id, info.held)        when an NPC with `info.held` appears (or its info changes)
//   held.release(id)               the captive got up (freed): the door swings open
//   held.update(dt, posOf)         posOf(id) -> { x, z } of that NPC now
//   held.remove(id) / held.clear()
//
// `cageGeometry()` (two merged vertex-coloured geometries: the cage and its door) and `shouldOpen()` are exported for tests.

import * as THREE from 'three';
import { merged } from './prof-models.js';

export const CAGE = { half: 1.0, height: 2.15, openAngle: 1.9, leaveM: 1.15 };
const WOOD = '#5e4a36', WOOD_DARK = '#43352a', IRON = '#4b4f56', IRON_DARK = '#33363c', STRAW = '#c9b060', BRASS = '#a8873a';

/** Has the captive left the cage? Pure. `held` = the info block, `pos` = where the captive stands now (or null). */
export function shouldOpen(held, pos, leaveM = CAGE.leaveM) {
  if (!held) return false;
  if (held.open) return true;
  return !!pos && Math.hypot(pos.x - held.x, pos.z - held.z) > leaveM;
}

const box = (w, h, d, x, y, z, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };

/** -> { cage, door }: metres, floor at y 0, the door in the +z wall, hinged at (+half, +half) and modelled around its hinge. */
export function cageGeometry() {
  const H = CAGE.half, T = CAGE.height, cage = [], door = [];
  // floor: a frame of sleepers, planks, straw
  for (const s of [-1, 1]) { cage.push({ g: box(2 * H + 0.16, 0.14, 0.16, 0, 0.07, s * H), c: WOOD_DARK }); cage.push({ g: box(0.16, 0.14, 2 * H + 0.16, s * H, 0.07, 0), c: WOOD_DARK }); }
  for (let i = 0; i < 6; i++) cage.push({ g: box(0.3, 0.05, 2 * H, -H + 0.17 + i * 0.332, 0.13, 0), c: i % 2 ? WOOD : WOOD_DARK });
  for (const [x, z, r] of [[-0.45, -0.5, 0.3], [0.3, -0.6, 1.1], [-0.2, 0.35, 2.0], [0.5, 0.2, 0.6]]) cage.push({ g: box(0.5, 0.03, 0.12, x, 0.17, z, r), c: STRAW });
  // corner posts and the top frame
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cage.push({ g: box(0.14, T, 0.14, sx * H, T / 2, sz * H), c: WOOD });
  for (const s of [-1, 1]) { cage.push({ g: box(2 * H + 0.14, 0.12, 0.14, 0, T - 0.06, s * H), c: WOOD_DARK }); cage.push({ g: box(0.14, 0.12, 2 * H + 0.14, s * H, T - 0.06, 0), c: WOOD_DARK }); }
  // roof bars and a lifting ring
  for (let i = 1; i < 6; i++) cage.push({ g: box(0.045, 0.045, 2 * H, -H + i * (2 * H / 6), T - 0.03, 0), c: IRON });
  cage.push({ g: box(2 * H, 0.05, 0.05, 0, T - 0.02, 0), c: IRON_DARK });
  { const g = new THREE.TorusGeometry(0.11, 0.025, 4, 8); g.translate(0, T + 0.1, 0); cage.push({ g, c: IRON_DARK }); }
  // iron bars on three walls, with a flat band across the middle
  const bars = 7;
  for (let i = 1; i < bars; i++) {
    const p = -H + i * (2 * H / bars);
    cage.push({ g: box(0.04, T - 0.26, 0.04, p, T / 2 + 0.01, -H), c: IRON });
    for (const sx of [-1, 1]) cage.push({ g: box(0.04, T - 0.26, 0.04, sx * H, T / 2 + 0.01, p), c: IRON });
  }
  cage.push({ g: box(2 * H, 0.06, 0.03, 0, 1.05, -H), c: IRON_DARK });
  for (const sx of [-1, 1]) cage.push({ g: box(0.03, 0.06, 2 * H, sx * H, 1.05, 0), c: IRON_DARK });
  // the door: its hinge edge is x = 0 and it runs to x = -(2H - 0.16); it hangs in the +z wall
  const W = 2 * H - 0.16;
  door.push({ g: box(W, 0.07, 0.05, -W / 2, 0.22, 0), c: IRON_DARK }); door.push({ g: box(W, 0.07, 0.05, -W / 2, T - 0.2, 0), c: IRON_DARK }); door.push({ g: box(W, 0.06, 0.035, -W / 2, 1.05, 0), c: IRON_DARK });
  door.push({ g: box(0.06, T - 0.36, 0.05, -0.03, T / 2 + 0.01, 0), c: IRON_DARK }); door.push({ g: box(0.06, T - 0.36, 0.05, -W + 0.03, T / 2 + 0.01, 0), c: IRON_DARK });
  for (let i = 1; i < 6; i++) door.push({ g: box(0.04, T - 0.42, 0.04, -i * (W / 6), T / 2 + 0.01, 0), c: IRON });
  door.push({ g: box(0.13, 0.15, 0.06, -W + 0.06, 1.0, 0.05), c: BRASS });                                    // the padlock…
  { const g = new THREE.TorusGeometry(0.05, 0.014, 4, 8, Math.PI); g.translate(-W + 0.06, 1.075, 0.05); door.push({ g, c: IRON }); }   // …and its shackle
  for (const y of [0.5, 1.65]) door.push({ g: box(0.07, 0.12, 0.07, 0, y, 0), c: IRON_DARK });               // hinges
  return { cage: merged(cage), door: merged(door) };
}

export function createHeld(scene, { groundY = () => 0, compile = null } = {}) {
  const items = new Map();
  let shared = null;
  const parts = () => (shared ||= { ...cageGeometry(), mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.1, flatShading: true }) });

  function set(id, held) {
    if (!held || held.kind !== 'cage' || !Number.isFinite(held.x) || !Number.isFinite(held.z)) { remove(id); return null; }
    let it = items.get(id);
    if (!it) {
      const { cage, door, mat } = parts();
      const root = new THREE.Group(); root.name = 'held:cage';
      const body = new THREE.Mesh(cage, mat); body.castShadow = true; body.receiveShadow = true;
      const leaf = new THREE.Mesh(door, mat); leaf.castShadow = true; leaf.position.set(CAGE.half - 0.08, 0, CAGE.half);
      root.add(body, leaf);
      root.position.set(held.x, groundY(held.x, held.z), held.z);
      root.rotation.y = ((Number(id) || 0) * 2.399) % (Math.PI * 2);          // every cage faces its own way
      it = { root, leaf, open: 0, want: false, held };
      items.set(id, it);
      if (compile) Promise.resolve(compile(root)).catch(() => {}).then(() => { if (items.get(id) === it) scene.add(root); });
      else scene.add(root);
    }
    it.held = held;
    if (held.open && !it.want) { it.want = true; if (!it.seen) it.open = 1; }      // already open when first seen: no swing
    it.seen = true;
    return it;
  }
  function update(dt, posOf = () => null) {
    for (const [id, it] of items) {
      if (!it.want && shouldOpen(it.held, posOf(id))) it.want = true;            // one way: a freed captive walking back past it does not shut the door
      const to = it.want ? 1 : 0;
      if (it.open !== to) it.open += Math.sign(to - it.open) * Math.min(Math.abs(to - it.open), dt * 1.6);
      const e = it.open * it.open * (3 - 2 * it.open);
      it.leaf.rotation.y = -e * CAGE.openAngle;                                  // swings outward (+z)
      it.root.position.y = groundY(it.held.x, it.held.z);
    }
  }
  /** The captive was freed just now (they got up): open the door. */
  function release(id) { const it = items.get(id); if (it) it.want = true; }
  function remove(id) { const it = items.get(id); if (!it) return; scene.remove(it.root); items.delete(id); }
  function clear() { for (const id of [...items.keys()]) remove(id); }
  return { set, update, release, remove, clear, items };
}
