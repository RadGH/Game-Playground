// Builds any row of data/vehicle-catalog.json for the Vehicles page, with the owning game's own model code. Nothing is
// copied, so the page shows what the game draws.
//
//   const show = await buildCatalogModel(row, { thumb });
//     -> { group, anim, anims, setAnim, update(dt, t), metrics(), dispose(), env }   (the shape tv-vehicles-gallery.js uses)
//   thumb: true leaves the scenery out (the ship's sea), for a card's picture
//   await sourceUnavailable(row)   why this copy of the site cannot build the row, or null
//
// Every game's code is a DYNAMIC import behind this file: the public copies of Tumblefair, Knockabout and Roverlands hold
// avatar-3d but not every prototype (rads-game-server server/rgs ALLOW), so a game's folder may simply be missing. Then
// the rows from that game say so and the rest of the page goes on working. A static import here would take the page down.
//
// Everything is turned to face +x like the page's own vehicles: Roverlands, Farhold and the mounts are built facing +z.
import * as THREE from 'three';
import { createVehicle } from './vehicles.js';
import { buildTvVehicle, SHIP_EXTRAS } from './tv-vehicles-gallery.js';

const ROOT = new URL('../../', import.meta.url);
const at = p => new URL(p, ROOT).href;

// one try per module: a folder missing from this copy gives one 404, not one per card
const loaded = new Map();
const load = path => { if (!loaded.has(path)) loaded.set(path, import(at(path))); return loaded.get(path); };

let roverDefs = null;
function roverData() {
  roverDefs ||= fetch(at('prototypes/roverlands/data/vehicles.json')).then(r => { if (!r.ok) throw new Error('Roverlands is not in this copy of the site'); return r.json(); }).then(j => new Map(j.vehicles.map(v => [v.id, v])));
  return roverDefs;
}

/** What each builder needs from another folder. A row's builder missing here needs nothing that can be left out. */
const NEEDS = { roverlands: 'prototypes/roverlands/js/client/models/index.js', boat: 'prototypes/farhold/js/boat.js', space: 'assets/js/space-models.js' };

export async function sourceUnavailable(row) {
  if (!row.builder) return row.notShown || 'No model to show';
  try {
    if (row.builder === 'roverlands') await roverData();
    if (NEEDS[row.builder]) await load(NEEDS[row.builder]);
    return null;
  } catch { return (row.source || 'That game') + ' is not in this copy of the site'; }
}

/** The box of what is actually drawn (Box3.setFromObject counts hidden hulls too; the boat rig holds all four). */
function visibleBox(root) {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3(), one = new THREE.Box3();
  root.traverseVisible(o => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    box.union(one.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
  });
  return box;
}

function disposeMeshes(root) { root.traverse(o => o.geometry?.dispose?.()); }   // materials stay: Roverlands' are shared by every vehicle

/**
 * Stand a +z model on the page's floor: turned to +x, centred, lowest point at y 0. `spin` turns it the extra way a model
 * built along some other axis needs.
 */
function stage(model, { update = () => {}, anims = ['idle'], setAnim = null, dispose = () => disposeMeshes(model), spin = Math.PI / 2 } = {}) {
  const inner = new THREE.Group(); inner.add(model);
  inner.rotation.y = spin;
  const root = new THREE.Group(); root.userData.character = true; root.add(inner);
  update(0.016, 0);
  const b = visibleBox(root), c = b.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -b.min.y, -c.z);
  const size = b.getSize(new THREE.Vector3());
  const m = { length: size.x, width: size.z, height: size.y, center: { x: 0, y: size.y / 2, z: 0 }, animals: 0 };
  const big = Math.max(1, Math.max(size.x, size.z) / 3.4);
  const show = {
    group: root, anim: anims[0], anims,
    env: { background: '#1e2128', near: 0.05, far: 300, maxDistance: Math.max(12, big * 16), minDistance: 0.3, ground: true, floorScale: big },
    setAnim(n) { show.anim = n; setAnim?.(n); },
    update(dt, t) { update(dt, t, show.anim); },
    metrics: () => m,
    dispose,
  };
  return show;
}

async function buildRover(row) {
  const [defs, M] = await Promise.all([roverData(), load(NEEDS.roverlands)]);
  const def = defs.get(row.model);
  if (!def) throw new Error('Roverlands has no vehicle ' + row.model);
  if (def.type === 'prop') {
    const P = await load('prototypes/roverlands/js/client/models/props.js');
    const prop = P.buildProp(THREE, def, {});
    return stage(prop.group, { anims: ['idle', 'firing'], update(dt, t, a) { prop.update({ flame: a === 'firing' }); } });
  }
  const model = await M.buildModel(THREE, def, {});
  const wheels = def.wheels || [];
  const siren = row.tags.includes('emergency');
  let spin = 0;
  return stage(model.group, {
    anims: ['idle', 'roll', ...(siren ? ['siren'] : [])],
    update(dt, t, anim = 'idle') {
      const rolling = anim === 'roll';
      if (rolling) spin -= dt * 6;
      const steer = rolling ? Math.sin(t * 0.8) * 0.3 : 0;
      model.update({ t, steer, rotor: rolling ? 1 : 0, lever: rolling ? 1 : 0, forks: 0, acts: { siren: anim === 'siren' },
        wheels: wheels.map(w => ({ comp: 0.11, spin, steer: w.steer ? steer * w.steer : 0 })) });
    },
  });
}

async function buildGround(row) {
  const { createGroundVehicle } = await import('./ground-vehicles.js');
  const rig = createGroundVehicle(); rig.show(row.model);
  return stage(rig.group, { anims: ['idle', 'roll'], update(dt, t, a) { rig.update(dt, a === 'roll' ? 6 : 0); } });
}

async function buildBoat(row) {
  const { createBoat } = await load(NEEDS.boat);
  const rig = createBoat(); rig.show(row.model);
  return stage(rig.group, { update(dt) { rig.update(dt, false); } });
}

async function buildMount(row) {
  const { createMount } = await import('./mounts.js');
  const mount = await createMount(row.model);
  return stage(mount.group, { anims: ['idle', 'walk', 'run'], setAnim: n => mount.setAnim(n), update: (dt, t) => mount.update(dt, t), dispose: () => mount.dispose() });
}

async function buildSpace(row) {
  const { createSpaceModel } = await load(NEEDS.space);
  const m = createSpaceModel(row.model);
  return stage(m.group, { update: (dt, t) => m.update?.(dt, t), dispose: () => m.dispose?.() });
}

export async function buildCatalogModel(row, { thumb = false, camera = null, extras = null } = {}) {
  switch (row.builder) {
    case 'vehicles': return createVehicle({ type: row.model });
    case 'tv': return buildTvVehicle(row.model, { camera, extras: extras || (thumb ? Object.fromEntries(SHIP_EXTRAS.map(k => [k, false])) : {}) });
    case 'roverlands': return buildRover(row);
    case 'ground': return buildGround(row);
    case 'boat': return buildBoat(row);
    case 'mount': return buildMount(row);
    case 'space': return buildSpace(row);
    default: throw new Error(row.notShown || 'no builder for ' + row.id);
  }
}

/** The box a thumbnail should frame, from the same metrics the page's camera uses. */
export function frameOf(show) {
  const m = show.metrics(), c = m.center || { x: 0, y: m.height / 2, z: 0 };
  return new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(c.x, c.y, c.z), new THREE.Vector3(m.length, m.height, m.width));
}
