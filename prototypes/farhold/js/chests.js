// Farhold — treasure on the ground: chests you open and bags you walk over.
//
// Chests are **not** scattered like props. A prop is decoration and can be regenerated every time
// you cross a cell; a chest has state (open or not, what was in it), so these are real objects with
// their own meshes, placed deterministically from the world seed and the cell they sit in, and
// remembered once opened so a chest cannot be farmed by walking away and back.
//
// Four kinds, worth increasingly more: wooden, iron-bound, gilded, warded. A warded chest is
// guarded — something is standing next to it — and may not be a chest at all.
//
//   const chests = createChests(scene, terrain, { seed, balance, zones, rpg });
//   chests.update(px, pz);              // places and clears as you walk
//   const near = chests.nearest(px, pz);
//   const haul = chests.open(near, { level, magicFind });
//
// Loot bags are the same idea from the other end: a boss or a rare drops one, it sits there
// glowing, and walking over it hands you everything inside at once.

import * as THREE from 'three';
import { makeRng } from '../../../worldgen/js/noise.js';

const CELL = 64;                      // metres across one chest cell — the same grid props use

/** Stable hash for a cell, so the same clearing always holds the same chest. */
function cellSeed(seed, cx, cz, salt = 0) {
  let h = Math.imul(cx + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(cz + 0x165667b1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f) ^ Math.imul((seed >>> 0) + salt, 0x165667b1);
  return (h ^ (h >>> 16)) >>> 0;
}

// ---------------------------------------------------------------------------- geometry

function mergeParts(parts) {
  let total = 0;
  const prepared = parts.map(p => {
    const g = p.geometry.clone().toNonIndexed();
    g.applyMatrix4(p.matrix);
    g.computeVertexNormals();
    total += g.attributes.position.count;
    return { g, color: new THREE.Color(p.color) };
  });
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);
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

const at = (x, y, z, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const SPH = new THREE.SphereGeometry(1, 8, 6);
const OCT = new THREE.OctahedronGeometry(1, 0);
const TOR = new THREE.TorusGeometry(1, 0.1, 6, 14);

/**
 * A chest: a body, a barrel lid, banding, a lock plate and feet. `lid` in radians opens it — the
 * lid is built as its own piece so the open state is a rotation rather than a second model.
 */
function chestBody({ wood = '#5a4029', band = '#6a6e78', trim = '#c8a24a', lid = 0, gems = 0 } = {}) {
  const parts = [
    // body
    { geometry: BOX, color: wood, matrix: at(0, 0.34, 0, 1.15, 0.62, 0.78) },
    // feet
    { geometry: BOX, color: band, matrix: at(-0.47, 0.06, -0.3, 0.16, 0.12, 0.16) },
    { geometry: BOX, color: band, matrix: at(0.47, 0.06, -0.3, 0.16, 0.12, 0.16) },
    { geometry: BOX, color: band, matrix: at(-0.47, 0.06, 0.3, 0.16, 0.12, 0.16) },
    { geometry: BOX, color: band, matrix: at(0.47, 0.06, 0.3, 0.16, 0.12, 0.16) },
    // banding around the body
    { geometry: BOX, color: band, matrix: at(-0.34, 0.34, 0, 0.1, 0.66, 0.82) },
    { geometry: BOX, color: band, matrix: at(0.34, 0.34, 0, 0.1, 0.66, 0.82) },
    // lock plate
    { geometry: BOX, color: trim, matrix: at(0, 0.58, 0.4, 0.22, 0.24, 0.06) },
    { geometry: CYL, color: trim, matrix: at(0, 0.5, 0.43, 0.05, 0.1, 0.05) },
  ];
  // the lid: a half cylinder lying along x, hinged at the back edge
  const hinge = new THREE.Matrix4().makeTranslation(0, 0.65, -0.39);
  const lidRot = new THREE.Matrix4().makeRotationX(-lid);
  const lidLocal = (m) => new THREE.Matrix4().multiplyMatrices(hinge, new THREE.Matrix4().multiplyMatrices(lidRot, m));
  parts.push(
    { geometry: CYL, color: wood, matrix: lidLocal(at(0, 0.06, 0.39, 0.4, 1.15, 0.4, 0, 0, Math.PI / 2)) },
    { geometry: BOX, color: band, matrix: lidLocal(at(-0.34, 0.12, 0.39, 0.1, 0.5, 0.84)) },
    { geometry: BOX, color: band, matrix: lidLocal(at(0.34, 0.12, 0.39, 0.1, 0.5, 0.84)) },
  );
  for (let i = 0; i < gems; i++) {
    const a = (i / Math.max(1, gems)) * Math.PI - Math.PI / 2;
    parts.push({ geometry: OCT, color: trim, matrix: lidLocal(at(Math.sin(a) * 0.36, 0.3, 0.39 + Math.cos(a) * 0.12, 0.07)) });
  }
  return mergeParts(parts);
}

/** The four kinds, as closed and open geometry built once and shared by every instance. */
export const CHEST_LOOKS = {
  // a meteorite: black glassy rock with a hot seam still glowing in it
  meteorite: { wood: '#2a2420', band: '#6a3a28', trim: '#ff8a40', gems: 4, scale: 1.3 },
  wooden: { wood: '#5a4029', band: '#6a5a4a', trim: '#8a7a5a', gems: 0, scale: 1 },
  iron: { wood: '#4a3a2c', band: '#7a7e88', trim: '#9aa0aa', gems: 0, scale: 1.08 },
  gilded: { wood: '#4a3524', band: '#c8a24a', trim: '#ffd24a', gems: 3, scale: 1.16 },
  warded: { wood: '#2e2438', band: '#6a5a90', trim: '#b090ff', gems: 5, scale: 1.24 },
};

/** A loot bag: a slumped sack, a tie and a little glow disc under it. */
function bagBody(colour = '#6a5238', tie = '#c8a24a') {
  return mergeParts([
    { geometry: SPH, color: colour, matrix: at(0, 0.3, 0, 0.42, 0.34, 0.42) },
    { geometry: SPH, color: colour, matrix: at(0.12, 0.42, -0.08, 0.28, 0.26, 0.28) },
    { geometry: CYL, color: tie, matrix: at(0, 0.56, 0, 0.13, 0.12, 0.13) },
    { geometry: TOR, color: tie, matrix: at(0, 0.5, 0, 0.17, 0.17, 0.17, Math.PI / 2) },
  ]);
}

/** A stone brazier: a bowl on a column, with a flame body that the light module lights up. */
export function brazierBody(stone = '#6a6258', flame = '#ff9a40') {
  return mergeParts([
    { geometry: CYL, color: stone, matrix: at(0, 0.5, 0, 0.16, 1, 0.16) },
    { geometry: CYL, color: stone, matrix: at(0, 0.06, 0, 0.36, 0.12, 0.36) },
    { geometry: CYL, color: stone, matrix: at(0, 1.05, 0, 0.42, 0.22, 0.42) },
    { geometry: SPH, color: flame, matrix: at(0, 1.3, 0, 0.26, 0.4, 0.26) },
    { geometry: OCT, color: flame, matrix: at(0.1, 1.5, 0.06, 0.1, 0.2, 0.1) },
    { geometry: OCT, color: flame, matrix: at(-0.09, 1.46, -0.05, 0.08, 0.16, 0.08) },
  ]);
}

/** A wall sconce for dungeon corridors: a bracket and a flame. */
export function sconceBody(iron = '#3a3a42', flame = '#ffb070') {
  return mergeParts([
    { geometry: BOX, color: iron, matrix: at(0, 0, 0.06, 0.16, 0.5, 0.1) },
    { geometry: CYL, color: iron, matrix: at(0, 0.2, -0.16, 0.13, 0.22, 0.13) },
    { geometry: SPH, color: flame, matrix: at(0, 0.4, -0.16, 0.14, 0.24, 0.14) },
  ]);
}

/**
 * A shaft of light over something worth walking to.
 *
 * "Add rarity glow to these crates and normal chests to indicate (and guarantee) a minimum rarity
 * level. Higher rarities or specials like sets should have additional beams of glow and particles
 * to indicate how valuable they are."
 *
 * So the beacon is a **promise**: its colour is the rarity the container is guaranteed to hold, and
 * the number of beams climbs with it — one for a common find, four plus a ring of motes for
 * something legendary. A player learns to read it from across a field, and it never lies, because
 * the same `floor` drives the beam and the roll.
 *
 * Built from a cone with an additive material and no depth write, which is the cheapest thing that
 * reads as light in a scene with no post-processing.
 */
export const RARITY_BEACON = {
  normal: { color: '#c9c2b6', beams: 1, height: 1.8, motes: 0, opacity: 0.11 },
  magic: { color: '#7f95ff', beams: 2, height: 3.0, motes: 0, opacity: 0.2 },
  rare: { color: '#e8d020', beams: 3, height: 4.0, motes: 5, opacity: 0.24 },
  legendary: { color: '#ff8020', beams: 4, height: 5.2, motes: 8, opacity: 0.28 },
  set: { color: '#2fc4b2', beams: 4, height: 5.2, motes: 8, opacity: 0.28 },
  unique: { color: '#ff5a3c', beams: 5, height: 6.0, motes: 10, opacity: 0.3 },
};

const BEACON_CONE = new THREE.ConeGeometry(0.34, 1, 7, 1, true);
const MOTE = new THREE.SphereGeometry(0.06, 5, 4);

/**
 * `rarity` is the guaranteed floor. Returns a group to park at the container's feet, with an
 * `update(dt)` that turns the beams and bobs the motes.
 */
export function createBeacon(rarity = 'normal') {
  const look = RARITY_BEACON[rarity] || RARITY_BEACON.normal;
  const group = new THREE.Group();
  group.name = 'farhold-beacon';
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(look.color),
    transparent: true, opacity: look.opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beams = [];
  for (let i = 0; i < look.beams; i++) {
    const beam = new THREE.Mesh(BEACON_CONE, material);
    // point UP: a cone is built apex-up, and a light shaft reads better wide at the top
    beam.rotation.x = Math.PI;
    beam.scale.set(1 - i * 0.14, look.height * (1 + i * 0.1), 1 - i * 0.14);
    beam.position.y = look.height * (1 + i * 0.1) / 2;
    beam.rotation.y = (i / Math.max(1, look.beams)) * Math.PI * 2;
    beam.renderOrder = 8;
    group.add(beam);
    beams.push(beam);
  }
  const motes = [];
  const moteMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(look.color), transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (let i = 0; i < look.motes; i++) {
    const mote = new THREE.Mesh(MOTE, moteMat);
    mote.userData.phase = (i / Math.max(1, look.motes)) * Math.PI * 2;
    mote.userData.radius = 0.5 + (i % 3) * 0.22;
    group.add(mote);
    motes.push(mote);
  }
  let t = 0;
  return {
    group, rarity, look,
    update(dt) {
      t += dt;
      for (let i = 0; i < beams.length; i++) {
        beams[i].rotation.y += dt * (0.25 + i * 0.12);
        beams[i].material.opacity = look.opacity * (0.75 + 0.25 * Math.sin(t * 1.6 + i));
      }
      for (const m of motes) {
        const a = m.userData.phase + t * 0.9;
        m.position.set(Math.cos(a) * m.userData.radius, 0.5 + Math.sin(t * 1.4 + m.userData.phase) * 0.45, Math.sin(a) * m.userData.radius);
      }
    },
    dispose() {
      material.dispose();
      moteMat.dispose();
    },
  };
}

// ---------------------------------------------------------------------------- the field

/**
 * THE ONE LIVE CHEST FIELD.
 *
 * js/sites.js has to put a cache down beside a monument (4.12 — "any sort of monuments that don't
 * do anything currently need to do something … at the very least contain a chest nearby with
 * loot") and js/encounters.js has to put a strongbox on a stranded cart. Neither of them is handed
 * a chest field, and neither of them may edit js/main.js to be handed one.
 *
 * There is exactly one chest field per world — main.js builds a fresh one on landing and throws the
 * old one away — so rather than a global on `window`, the module that builds them remembers the
 * last one it built. It is replaced on the next landing, which is the behaviour you want: whoever
 * asks always gets the field for the planet under their feet.
 *
 * Both callers still prefer an explicitly handed-in field (`setChests`) when somebody wires one.
 * js/actors.js already does exactly this with `activeEnemyField()`, for the same reason.
 */
let CURRENT = null;
export function currentChests() { return CURRENT; }

export function createChests(scene, terrain, { seed = 1, balance = {}, zones = null, rpg = null, collide = null } = {}) {
  const cfg = balance.chests || {};
  const kinds = cfg.kinds || {};
  const kindKeys = Object.keys(kinds);
  const totalWeight = kindKeys.reduce((s, k) => s + (kinds[k].weight || 1), 0);

  const geometryCache = new Map();
  function geometryFor(kind, open) {
    const key = kind + (open ? ':open' : ':shut');
    if (!geometryCache.has(key)) {
      const look = CHEST_LOOKS[kind] || CHEST_LOOKS.wooden;
      geometryCache.set(key, chestBody({ ...look, lid: open ? 1.9 : 0 }));
    }
    return geometryCache.get(key);
  }
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const bagGeometry = bagBody();
  const bagMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color('#3a2a10') });

  const live = [];              // chests currently in the scene
  const bags = [];              // loot bags waiting to be picked up
  const opened = new Set();     // cell keys already looted, so nothing can be farmed
  let centre = [Infinity, Infinity];
  const radius = cfg.radius ?? 5;

  function pickKind(r) {
    let roll = r * totalWeight;
    for (const k of kindKeys) {
      roll -= kinds[k].weight || 1;
      if (roll <= 0) return k;
    }
    return kindKeys[0];
  }

  /** Rebuild the chests around a point. Only runs when the player crosses a cell boundary. */
  function update(px, pz) {
    const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
    if (cx === centre[0] && cz === centre[1]) return;
    centre = [cx, cz];

    // drop anything that has walked out of range
    for (let i = live.length - 1; i >= 0; i--) {
      const c = live[i];
      if (Math.abs(Math.floor(c.x / CELL) - cx) <= radius && Math.abs(Math.floor(c.z / CELL) - cz) <= radius) continue;
      scene.remove(c.mesh);
      dropBeacon(c);
      live.splice(i, 1);
    }
    const held = new Set(live.map(c => c.key));

    for (let gz = cz - radius; gz <= cz + radius; gz++) {
      for (let gx = cx - radius; gx <= cx + radius; gx++) {
        const key = `${gx},${gz}`;
        if (held.has(key)) continue;
        const rng = makeRng(cellSeed(seed, gx, gz, 0x7ea5));
        if (rng() > (cfg.perCell ?? 0.012)) continue;
        const x = (gx + rng()) * CELL, z = (gz + rng()) * CELL;
        const [wx, wz] = terrain.clampToWorld(x, z);
        if (terrain.underwater(wx, wz)) continue;
        if (terrain.slopeAt && terrain.slopeAt(wx, wz) > 0.5) continue;
        let kind = pickKind(rng());
        // R25 — a guaranteed legendary is not a low-level find: below its zone level it is gilded
        const minZ = kinds[kind]?.minZoneLevel;
        if (minZ && (zones?.at?.(wx, wz)?.maxLevel ?? 99) < minZ) kind = kinds.gilded ? 'gilded' : kind;
        const chest = place(kind, wx, wz, { key, opened: opened.has(key), facing: rng() * Math.PI * 2 });
        if (chest) chest.rng = rng;
      }
    }
  }

  /**
   * Put one chest into the world. Dungeons call this directly, and so does a bandit camp.
   *
   * `name` overrides the grade's own label. A camp's strongbox reading "Iron-Bound Chest" on the
   * reward screen tells you nothing about where you just fought; "The Stockade's Strongbox" does.
   */
  function place(kind, x, z, { key = null, opened: isOpen = false, facing = 0, level = null, name = null, floor = null } = {}) {
    const look = CHEST_LOOKS[kind] || CHEST_LOOKS.wooden;
    const mesh = new THREE.Mesh(geometryFor(kind, isOpen), material);
    const y = terrain.heightAt(x, z);
    mesh.position.set(x, y, z);
    mesh.rotation.y = facing;
    mesh.scale.setScalar(look.scale || 1);
    mesh.name = 'farhold-chest-' + kind;
    scene.add(mesh);
    const spec = kinds[kind] || {};
    const chest = {
      kind, x, z, y, mesh, facing,
      key: key || `placed:${Math.round(x)},${Math.round(z)}`,
      opened: isOpen, level, spec,
      name: name || spec.name || 'Chest',
      /**
       * `floor` may be raised by the caller.
       *
       * The grade's own floor is right for scattered chests, but a stronghold's `gives.loot` is a
       * PROMISE about that particular keep — and since the beacon colour and the roll read the same
       * field, raising it here makes the light outside match what is really in the box.
       */
      floor: floor || spec.floor || 'normal',
    };
    // The beacon promises what is inside. Same `floor` drives the colour and the roll, so it cannot
    // lie; an opened chest loses it, because there is nothing left to promise.
    if (!isOpen) {
      chest.beacon = createBeacon(chest.floor);
      chest.beacon.group.position.set(x, y + 0.2, z);
      scene.add(chest.beacon.group);
    }
    live.push(chest);
    collide?.add(x, z, 0.8, 1);
    return chest;
  }

  /** Take a container's beacon away — it has been opened, or it has gone. */
  function dropBeacon(holder) {
    if (!holder?.beacon) return;
    scene.remove(holder.beacon.group);
    holder.beacon.dispose();
    holder.beacon = null;
  }

  /** The chest you are standing next to, or null. */
  function nearest(px, pz, range = cfg.openRange ?? 3.2) {
    let best = null, bestD = range;
    for (const c of live) {
      if (c.opened) continue;
      const d = Math.hypot(c.x - px, c.z - pz);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  /**
   * Open it. Returns `{ items, gold, materials }` — the caller shows the reward screen and puts it
   * all in the bag. A warded chest may turn out to be a mimic, in which case nothing is in it and
   * `mimic` comes back true.
   */
  function open(chest, { level = 1, magicFind = 0, rng = null } = {}) {
    if (!chest || chest.opened) return null;
    /**
     * R25 — A GUARDED CHEST STAYS SHUT UNTIL ITS GUARDS ARE DOWN.
     *
     *   "You can just ignore the enemies, run up and steal the loot, and run away. These events
     *    should only drop the reward chest after you've killed all the enemies that spawned."
     *
     * `guards` is the list of bodies the chest belongs to (an event's ambush, a camp's garrison, a
     * world boss); `guardPending` is a trap whose bodies have not come out of the grass yet. Either
     * way the lid does not come up — and touching it is what springs a trap (`touched`).
     */
    const standingGuards = (chest.guards || []).filter(u => u && !u.removed && u.dying == null);
    if (chest.guardPending || standingGuards.length) {
      chest.touched = true;
      return { sealed: chest.guardPending ? 'Something is watching this chest.' : `Not while ${standingGuards.length === 1 ? 'its guard is' : `${standingGuards.length} of its guards are`} still standing.`, chest };
    }
    const r = rng || chest.rng || makeRng(cellSeed(seed, Math.round(chest.x), Math.round(chest.z), 0x1234));
    const spec = chest.spec || {};
    chest.opened = true;
    opened.add(chest.key);
    chest.mesh.geometry = geometryFor(chest.kind, true);
    dropBeacon(chest);

    if (spec.mimicChance && r() < spec.mimicChance) return { mimic: true, chest };

    const lvl = chest.level || level;
    const items = [];
    const want = spec.items ? spec.items[0] + Math.floor(r() * (spec.items[1] - spec.items[0] + 1)) : 1;
    for (let i = 0; i < want && rpg; i++) {
      const item = rpg.rollDrop({
        level: lvl, rng: rpg.rng, magicFind, chance: 1,
        rarityBoost: spec.rarityBoost || 1,
        floor: i === 0 ? spec.floor || null : null,
      });
      if (item) items.push(item);
    }
    const gold = spec.gold
      ? Math.round((spec.gold[0] + r() * (spec.gold[1] - spec.gold[0])) * (1 + lvl * 0.12))
      : 0;
    return { items, gold, materialCount: spec.materials || 0, chest, level: lvl };
  }

  // ---------------------------------------------------------------- loot bags

  /**
   * Drop a bag. Bosses and rares leave one rather than pushing five items straight into the bag —
   * the walk over to pick it up is the beat that makes a kill feel finished.
   */
  function dropBag(x, z, contents = {}) {
    const mesh = new THREE.Mesh(bagGeometry, bagMaterial);
    const y = terrain.heightAt(x, z);
    mesh.position.set(x, y, z);
    mesh.name = 'farhold-lootbag';
    scene.add(mesh);
    const bag = { x, z, y, mesh, contents, bob: 0, life: 0 };
    // a bag wears the colour of the best thing in it, so you know from a distance whether the walk
    // over is worth making
    bag.beacon = createBeacon(bestRarity(contents.items));
    bag.beacon.group.position.set(x, y, z);
    scene.add(bag.beacon.group);
    bags.push(bag);
    return bag;
  }

  /** The best rarity in a list of items — what a bag's beacon is coloured by. */
  function bestRarity(items = []) {
    const order = ['normal', 'magic', 'rare', 'legendary'];
    let best = 'normal';
    for (const it of items || []) {
      if (it?.setId) return 'set';
      if (it?.isUnique) return 'unique';
      if (order.indexOf(it?.rarity) > order.indexOf(best)) best = it.rarity;
    }
    return best;
  }

  /** Bob the bags, and hand over anything the player has walked onto. Returns what was collected. */
  function collect(px, pz, dt = 0, range = 2.4) {
    const got = [];
    for (let i = bags.length - 1; i >= 0; i--) {
      const b = bags[i];
      b.bob += dt * 2.2;
      b.life += dt;
      b.mesh.position.y = b.y + 0.1 + Math.sin(b.bob) * 0.08;
      b.mesh.rotation.y += dt * 0.8;
      b.beacon?.update(dt);
      if (Math.hypot(b.x - px, b.z - pz) < range) {
        got.push(b.contents);
        scene.remove(b.mesh);
        dropBeacon(b);
        bags.splice(i, 1);
      }
    }
    // the chests you can see turn their beams too
    for (const c of live) c.beacon?.update(dt);
    return got;
  }

  function clear() {
    for (const c of live) { scene.remove(c.mesh); dropBeacon(c); }
    for (const b of bags) { scene.remove(b.mesh); dropBeacon(b); }
    live.length = 0; bags.length = 0;
    centre = [Infinity, Infinity];
  }

  /**
   * Take a chest away again, unopened.
   *
   * The defend events in js/encounters.js need it: the cart's strongbox stands there from the first
   * second, and if the clock runs out the raiders take it. Without this the box simply stays and
   * "they got the box" is a line of text that is not true.
   */
  function remove(chest) {
    const i = live.indexOf(chest);
    if (i < 0) return false;
    scene.remove(chest.mesh);
    dropBeacon(chest);
    live.splice(i, 1);
    return true;
  }

  /**
   * Roll a grade's worth of loot and leave it on the ground as a bag.
   *
   * A rescue or a chase has no container at the end of it — there is nothing to open, the thing you
   * freed or caught simply had something on it — so the payout is a bag you walk over. Same rolls a
   * chest of that grade would have made, so the grades mean the same thing everywhere.
   */
  function rewardBag(x, z, { kind = 'iron', level = 1, magicFind = 0, rng = null } = {}) {
    const spec = kinds[kind] || {};
    const r = rng || makeRng(cellSeed(seed, Math.round(x), Math.round(z), 0x5eed));
    const items = [];
    const want = spec.items ? spec.items[0] + Math.floor(r() * (spec.items[1] - spec.items[0] + 1)) : 1;
    for (let i = 0; i < want && rpg; i++) {
      const item = rpg.rollDrop({
        level, rng: rpg.rng, magicFind, chance: 1,
        rarityBoost: spec.rarityBoost || 1,
        floor: i === 0 ? spec.floor || null : null,
      });
      if (item) items.push(item);
    }
    const gold = spec.gold
      ? Math.round((spec.gold[0] + r() * (spec.gold[1] - spec.gold[0])) * (1 + level * 0.12))
      : 0;
    return dropBag(x, z, { items, gold, mats: {} });
  }

  const api = {
    update, place, nearest, open, dropBag, collect, clear, remove, rewardBag,
    /** R14: the bags on the ground, so a test can prove a kill actually paid out. */
    get bags() { return bags; },
    get chests() { return live; },
    get bags() { return bags; },
    /** Every light a chest field wants lit — a warded chest glows. */
    lights: () => live.filter(c => c.kind === 'warded' && !c.opened)
      .map(c => ({ x: c.x, y: c.y + 0.8, z: c.z, color: '#b090ff', range: 10, intensity: 1.4 })),
    stats: () => ({ chests: live.length, bags: bags.length, opened: opened.size }),
  };
  CURRENT = api;
  return api;
}
