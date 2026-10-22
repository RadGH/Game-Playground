// Thousandvale's ship and ox cart, shown on the Vehicles page (vehicles.html, "Thousandvale" panel).
//
// Nothing is copied: the models come straight from Thousandvale's client modules, so the gallery shows what the game
// draws.
//
//   prototypes/thousandvale/js/client/ship-view.js    buildShip({ furled }) — the Saltwren, three-masted, sails set or furled —
//                                                     and the sea around it: createSea (the voyage's animated sea),
//                                                     createGulls, createSpray (bow spray), createSerpent (the brine-wyrm),
//                                                     createPlume (Vharlen's ash plume), buildPier (the jetty a moored ship
//                                                     lies at; Port Vharl's, from data/provinces/ships.json)
//   prototypes/thousandvale/js/client/carts-view.js   createCarts(): the ox cart as the game builds it (CART_SPEC: avatar-3d's
//                                                     ox_cart pulled by CART_HORSE, a bay draft horse, backed up between the
//                                                     shafts) — and OX, the older ox look, still exported
//
// The ship is posed the way ship-view.js poses it: under sail it rides the sea's lift with the voyage's pitch and roll and
// the water runs past at the ship's own speed (VOYAGE.visualMps); moored it bobs at the world water line like the ships
// at each harbour. The voyage's sea stands VOYAGE.seaLift up, so at a mooring it is lowered by that much.
//
//   TV_VEHICLES                            [{ id, label, desc }]
//   const show = await buildTvVehicle(id, { extras, camera })
//     -> { group, anim, anims, setAnim, update(dt, t), metrics(), dispose(), env, setExtras(extras) }
//   extras = { sea, gulls, spray, serpent, plume } (ship only; all on by default)
//   env    = what the page should set while it is shown: { background, fog: [colour, near, far], near, far, maxDistance, ground }

import * as THREE from 'three';
import { createVehicle } from './vehicles.js';

const TV = new URL('../../prototypes/thousandvale/', import.meta.url);
const shipMod = () => import(new URL('js/client/ship-view.js', TV).href);
const cartMod = () => import(new URL('js/client/carts-view.js', TV).href);

export const TV_VEHICLES = [
  { id: 'tv_ship_sail', label: 'Ship — under sail', desc: "Thousandvale's ship (the Saltwren) at sea between Torbor Downs and Vharlen: eleven sails set, flags flying, the voyage's sea, wake, gulls, bow spray, the brine-wyrm breaching and Vharlen's ash plume on the horizon. ship-view.js buildShip({ furled: false })." },
  { id: 'tv_ship_moored', label: 'Ship — moored at its jetty', desc: "The same ship with its sails furled, lying at Port Vharl's jetty (buildPier, from data/provinces/ships.json) — how a ship waits at each harbour. ship-view.js buildShip({ furled: true })." },
  { id: 'tv_cart', label: 'Ox cart (Thousandvale)', desc: "The paid fast-travel cart at each town's gate road, as carts-view.js builds it: avatar-3d's ox cart (CART_SPEC) pulled by CART_HORSE, a bay draft horse on the mounts' equine body, backed up between the shafts." },
  { id: 'tv_cart_ox', label: 'Ox cart with the ox (OX)', desc: "carts-view.js OX: the older draught animal (the bestiary's cow frame, heavier and brown, short horns), still exported; the game now uses the draft horse. Built with createVehicle and the game's own shaft adjustment." },
];
export const TV_VEHICLE_IDS = TV_VEHICLES.map(v => v.id);
export const SHIP_EXTRAS = ['sea', 'gulls', 'spray', 'serpent', 'plume'];

const SKY = '#a9c0d2';
const SHIP_ENV = { background: SKY, fog: [SKY, 1800, 21000], near: 0.3, far: 9000, maxDistance: 600, minDistance: 4, ground: false };

function disposeTree(root, keepShared) {
  root.traverse(o => {
    o.geometry?.dispose?.();
    if (!keepShared && o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose?.());
  });
}

async function buildShipShow(furled, { extras = {}, camera = null } = {}) {
  const S = await shipMod();
  const V = S.VOYAGE;
  const on = { sea: true, gulls: true, spray: !furled, serpent: !furled, plume: !furled, ...extras };
  const root = new THREE.Group(); root.name = 'tv-ship-scene'; root.userData.character = true;   // the page's turntable turns it
  root.rotation.y = Math.PI / 2;               // the ship is built bow +z; every vehicle on this page faces +x
  const ship = S.buildShip({ furled });
  root.add(ship.group);
  // moored: Port Vharl's jetty, laid out relative to the berth and turned so the ship lies bow +z
  let pier = null;
  if (furled) {
    const data = await fetch(new URL('data/provinces/ships.json', TV)).then(r => (r.ok ? r.json() : null)).catch(() => null);
    const h = (data?.harbours || []).find(x => x.pier && x.berth);
    if (h) {
      const by = h.berth.yaw || 0, c = Math.cos(-by), s = Math.sin(-by);
      const rel = ([x, z]) => { const dx = x - h.berth.x, dz = z - h.berth.z; return [dx * c + dz * s, -dx * s + dz * c]; };
      pier = S.buildPier(rel(h.pier.from), rel(h.pier.to), () => 0.6);
      root.add(pier);
    }
  }
  const sea = S.createSea(), gulls = S.createGulls(), spray = S.createSpray(), serpent = S.createSerpent(), plume = S.createPlume();
  sea.uniforms.uSky.value.set(SKY);
  sea.uniforms.uSun.value.set(2.5, 5, 3).normalize();            // the page's key light
  if (furled) sea.mesh.position.y = -V.seaLift;                  // a mooring sits on the world water (y 0), not the voyage's lifted sea
  serpent.group.position.set(-42, 0, 58); serpent.group.rotation.y = 0.3; serpent.group.scale.setScalar(2.3);   // off the starboard bow, as the voyage puts it
  root.add(sea.mesh, gulls.group, spray.points, serpent.group, plume.group);
  const volcano = { x: 4500, y: -200, z: -2600 };                // ~5 km off, on the horizon behind the ship from the page's starting view
  const apply = () => {
    sea.mesh.visible = !!on.sea; gulls.group.visible = !!on.gulls; spray.points.visible = !!on.spray; plume.group.visible = !!on.plume;
    if (!on.serpent) serpent.group.visible = false;
  };
  apply();
  let t = 0, run = 0;
  const wp = new THREE.Vector3();
  const show = {
    group: root, anim: 'idle', anims: ['idle'], ship: true, env: SHIP_ENV,
    setAnim(n) { show.anim = 'idle'; },
    setExtras(x) { Object.assign(on, x); apply(); },
    get extras() { return { ...on }; },
    update(dt) {
      t += dt;
      const g = ship.group;
      if (furled) {
        // ship-view.js update(): the moored ships bob and roll a little
        g.position.y = (on.sea ? 0 : 3.1) + 0.2 * Math.sin(t * 0.9); g.rotation.z = 0.02 * Math.sin(t * 0.7);
        ship.update(t, 0.2);
      } else {
        // ship-view.js pose(): riding the voyage sea, pitch and roll, the sails full
        g.position.y = on.sea ? V.seaLift + 0.3 * Math.sin(t * 1.05) - 0.15 : 3.1;
        g.rotation.set(0.022 * Math.sin(t * 1.27 + 1), 0, 0.045 * Math.sin(t * 0.83) + 0.05, 'YXZ');
        ship.update(t, 1);
        run += dt * V.visualMps;
      }
      const U = sea.uniforms;
      U.uTime.value = t; U.uOff.value.set(0, run); U.uYaw.value = 0; U.uRun.value = run; U.uWake.value = furled ? 0 : 1; U.uDay.value = 1;
      if (on.gulls) gulls.update(t);
      if (on.spray) spray.update(dt, furled ? 0 : 34);
      // the brine-wyrm: one breach every 13 s (the voyage has one per crossing)
      if (on.serpent) serpent.update(((t % 13) - 2) / V.serpentSec, dt);
      if (on.plume) plume.update(t, volcano, camera ? camera.getWorldPosition(wp) : null, 1, 0);
    },
    /** The ship's own size (the sea and the plume are scenery): +x = forward, like every vehicle here. */
    metrics() {
      root.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(ship.group), c = b.getCenter(new THREE.Vector3());
      return { length: b.max.x - b.min.x, width: b.max.z - b.min.z, height: b.max.y - b.min.y, center: { x: c.x, y: c.y, z: c.z }, animals: 0 };
    },
    dispose() {
      disposeTree(ship.group, true); if (pier) disposeTree(pier, true);      // ship-view.js shares its wood/sail materials between ships
      for (const o of [sea.mesh, gulls.group, spray.points, serpent.group, plume.group]) disposeTree(o, false);
    },
  };
  show.update(0.016);
  return show;
}

async function buildCartShow() {
  const C = await cartMod();
  const holder = new THREE.Group(); holder.name = 'tv-cart';
  const carts = C.createCarts(holder, {});
  await carts.prewarm();                                  // builds one cart the game's way (shaft adjustment, seat)
  carts.setParked('gallery', { x: 0, z: 0, yaw: Math.PI / 2 });     // yaw pi/2 = the model's own +x
  let c = null;
  for (let i = 0; i < 200 && !(c = carts.carts.get('gallery'))?.v; i++) await new Promise(r => setTimeout(r, 10));
  const v = c?.v;
  if (!v) throw new Error('the Thousandvale cart did not build');
  holder.userData.character = true;
  return {
    group: holder, get anim() { return v.anim; }, anims: null,
    setAnim(n) { v.setAnim(n); },
    update(dt, t) { carts.update(dt, t); },
    metrics() { return v.metrics(); },
    dispose() { v.dispose(); },
  };
}

async function buildOxCartShow() {
  const C = await cartMod();
  const v = await createVehicle({ type: 'ox_cart', size: 1, animal: C.OX });
  // carts-view.js build() backs the animal up between the shafts (the kit stands it a step ahead of the shaft tips); the
  // same three lines here, since that step lives inside createCarts and createCarts always builds CART_SPEC
  try {
    const root = v.group.children[0], ox = root?.children.find(c => c.userData?.character);
    if (ox) { const b = new THREE.Box3().setFromObject(ox), bed = v.metrics().seat?.x ?? -0.3; const rumpAt = Math.max(0.95, bed + 1.25); ox.position.x -= Math.max(0, (b.min.x - v.group.position.x) - rumpAt); }
  } catch { /* drawn where the kit put it */ }
  return v;
}

/** Build one of TV_VEHICLES. `extras` / `camera` are for the ship. */
export async function buildTvVehicle(id, opts = {}) {
  if (id === 'tv_ship_sail') return buildShipShow(false, opts);
  if (id === 'tv_ship_moored') return buildShipShow(true, opts);
  if (id === 'tv_cart') return buildCartShow();
  if (id === 'tv_cart_ox') return buildOxCartShow();
  throw new Error('unknown Thousandvale vehicle ' + id);
}
