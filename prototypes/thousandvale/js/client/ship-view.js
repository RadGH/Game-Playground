// THE VOYAGE (Expansion 1 §6, stream V): the crossing between Torbor Downs and Vharlen, drawn on the real sea in WORLD
// coordinates — not a fade. The server holds you for ~40 s (js/sim/ships.js) and sends `shipSail { from, to, path, ms,
// crew, berth, volcano }`; for those seconds this module owns the camera and draws:
//
//   the ship     a procedural three-masted ship (lofted hull with a raised quarterdeck and forecastle, planked deck,
//                masts and yards, eleven square and fore-and-aft sails that billow and flutter, shrouds and stays, a
//                pennant and an ensign that wave, stern windows and lanterns, a wheel). You stand on its deck; party
//                members who sailed with you (`crew`) stand beside you.
//   the sea      a local animated sea (a polar grid ~1.6 km across, waves in the vertex shader, sun glint, sky
//                reflection, foam on the crests) that fades into the far horizon's flat sea at its rim
//   the voyage   along `path` (tools/ship-routes.mjs, deep water off the coasts), time compressed: slow while casting
//                off, ~20 km in the middle seconds, slowing again as the ship comes alongside the far pier. The waves
//                and the wake run at a sailing ship's own speed whatever the compression, so the water never streaks.
//   the crossing gulls round the masts, spray off the bow, a wake, a sea serpent (original: the ridged "brine-wyrm")
//                breaching once off the starboard bow, and Vharlen's volcano ahead with an ash plume and a dull glow.
//
// Also, always: a ship moored at each harbour's berth (sails furled) with its wooden jetty — decor, from
// data/provinces/ships.json (fetched once).
//
//   const ships = createShipVoyage(scene, { view, camera, actors, travel, hud, controls, horizon, ws, worldUi, journal,
//                                           selfId, compile, net })
//   ships.wire(net)                 shipList / shipR / shipSail / joined / relocate
//   ships.ridePos(drawn)            where you are drawn while at sea (the deck); `drawn` untouched otherwise
//   ships.update(dt, elapsed)       after the game's camera: the voyage camera, the fx, the moored ships
//   ships.active / ships.state      for tests: { t, total, s, L, x, z, yaw, phase }
//
// Pure helpers (exported for tests): voyageProfile(L, T), buildShip({ furled }).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createShipTravel } from './ui/ship-travel.js';

/** The voyage's own numbers. */
export const VOYAGE = Object.freeze({
  castOffSec: 2.2, slowMps: 4, alongMps: 3.5,
  departRate: 0.55,         // Z49: leaving, metres a second for every metre from the berth
  arriveRate: 0.3,          // Z49: arriving, metres a second for every metre still to go — the shore grows at ONE steady rate
  flowMaxMps: 32,           // Z49: the water runs past at the ship's real speed up to this (past it, the land is far off and waves would streak)
  visualMps: 11,            // how fast the WATER moves past (the ship's real speed under sail), whatever the compression
  seaRadius: 5200, seaFadeFrom: 3900, seaLift: 1.1,
  fogNear: 1800, fogFar: 21000,
  serpentAt: 0.42, serpentSec: 7.5,
  arriveGraceMs: 12000,
});

const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a, b, t) => a + (b - a) * t;
const angDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/**
 * Pure: the distance along the route at time t for a route of L metres sailed in T seconds. -> { at(t) -> metres,
 * speed(t) -> m/s, vMax }.
 *
 * Play-test 11 (Z49, live #50: "when you are arriving the land zooms in very quickly and the water starts moving
 * opposite to the land … it's like the boat's about to crash into shore"). The old profile ran at full compressed speed
 * (hundreds of metres a second) until a fixed few seconds from the end, so the coast came on like a wall and then the
 * ship stood on its brakes. Now the speed is set by DISTANCE: leaving, it grows with the distance from the berth
 * (`departRate`); arriving, it is `arriveRate` x the distance still to go (+ a walking pace), so the far shore grows on
 * screen at one steady rate — a slow dolly in, never a lunge — and the last hundred metres are at a ship's own speed.
 * vMax (the open-sea middle, out where the land is a smudge) is whatever makes the voyage last T.
 */
export function voyageProfile(L, T, V = VOYAGE) {
  T = Math.max(6, T); L = Math.max(1, L);
  const rate = (vm, k) => (s, t) => {
    const dep = (V.slowMps + V.departRate * k * s) * (0.15 + 0.85 * smooth(t / V.castOffSec));
    const arr = V.alongMps + V.arriveRate * k * Math.max(0, L - s);
    return Math.max(0.3, Math.min(vm, dep, arr));
  };
  const N = 1200, dt = T / N;
  const run = (vm, k) => { let s = 0; const tab = new Float32Array(N + 1); for (let i = 0; i < N; i++) { const t = (i + 0.5) * dt; s = Math.min(L, s + rate(vm, k)(s, t) * dt); tab[i + 1] = s; } return tab; };
  // the gentlest rates that still get there: k grows only when even an unlimited middle cannot cover L in T
  let k = 1, tab = run(1e9, k);
  while (tab[N] < L * 0.999 && k < 64) { k *= 1.25; tab = run(1e9, k); }
  // vMax: the slowest open-sea speed that still arrives (bisection)
  let lo = V.slowMps, hi = 1e6;
  for (let it = 0; it < 50; it++) { const mid = (lo + hi) / 2; if (run(mid, k)[N] >= L * 0.999) hi = mid; else lo = mid; }
  const vMax = hi;
  tab = run(vMax, k);
  const sc = L / (tab[N] || 1);           // exact end
  const at = t => { if (t <= 0) return 0; if (t >= T) return L; const f = t / dt, i = Math.floor(f); return (tab[i] + (tab[i + 1] - tab[i]) * (f - i)) * sc; };
  return { vMax, T, k, at, speed: t => { t = Math.max(0, Math.min(T, t)); return rate(vMax, k)(at(t), t) * sc; } };
}

/**
 * Pure (play-test 12, #86: "on arrival the boat does an impossibly quick 180 degree turn on a dime"). The heading she
 * comes alongside with: the berth's own heading, or the opposite one (moored bow-in instead of bow-out), whichever is
 * nearer the heading she arrives on — so the last turn is at most a quarter turn, never a spin. No berth: the route's.
 */
export function arrivalYaw(berth, routeYaw) {
  if (!berth || !Number.isFinite(berth.yaw)) return routeYaw;
  const a = berth.yaw, b = berth.yaw + Math.PI;
  return Math.abs(angDelta(routeYaw, a)) <= Math.abs(angDelta(routeYaw, b)) ? a : Math.atan2(Math.sin(b), Math.cos(b));
}
/** Seconds a turn of (from -> to) is eased over: 3.2 s for nothing, plus TURN_SEC_PER_RAD for every radian (pure). */
export const TURN_SEC_PER_RAD = 2.2;
export const turnSec = (from, to) => 3.2 + TURN_SEC_PER_RAD * Math.abs(angDelta(from, to));

// ---------------------------------------------------------------------------------------------------------------------
// the ship

const HULL = { stern: -16, bow: 15, beam: 4.7, keel: -3.1, sheerMid: 2.7, sheerBow: 4.3, sheerStern: 5.4 };
const tToZ = t => HULL.stern + t * (HULL.bow - HULL.stern);
function halfBeam(t) {
  if (t < 0.46) return HULL.beam * (0.74 + 0.26 * Math.sin((t / 0.46) * Math.PI / 2));
  const u = (t - 0.46) / 0.54; return HULL.beam * Math.pow(Math.max(0, Math.cos(u * Math.PI / 2)), 0.78);
}
const sheer = t => HULL.sheerMid + (HULL.sheerStern - HULL.sheerMid) * Math.pow(1 - t, 5) + (HULL.sheerBow - HULL.sheerMid) * Math.pow(t, 5);
const keelAt = t => HULL.keel * (t > 0.8 ? 1 - smooth((t - 0.8) / 0.2) * 0.92 : t < 0.06 ? 0.85 + 0.15 * (t / 0.06) : 1);
/** Deck height: the waist, a raised quarterdeck aft and a forecastle forward (a short steep step between). */
const deckAt = t => 1.55 + 1.75 * (1 - smooth((t - 0.2) / 0.025)) + 0.9 * smooth((t - 0.84) / 0.025);
/** A hull section point: φ 0 = port rail, π/2 = keel, π = starboard rail. */
function sectionPoint(t, phi) {
  const hb = halfBeam(t), top = sheer(t), kl = keelAt(t), c = Math.cos(phi), s = Math.abs(Math.sin(phi));
  return [-Math.sign(c) * hb * Math.pow(Math.abs(c), 0.42), kl + (top - kl) * (1 - Math.pow(s, 2.4)), tToZ(t)];
}
/** The hull's half-width at height y in section t (for the deck edge). */
function widthAt(t, y) {
  const top = sheer(t), kl = keelAt(t), f = Math.max(0, Math.min(1, (top - y) / (top - kl)));
  const s = Math.pow(f, 1 / 2.4), c = Math.sqrt(Math.max(0, 1 - s * s));
  return halfBeam(t) * Math.pow(c, 0.42);
}

let TEX = null;
function textures() {
  if (TEX) return TEX;
  const canvas = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const plank = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#9a7650'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) { const y = i * 16; g.fillStyle = `hsl(${28 + (i * 37) % 9}, ${32 + (i * 13) % 10}%, ${40 + (i * 29) % 9}%)`; g.fillRect(0, y + 1, w, 14); g.fillStyle = 'rgba(40,24,12,0.65)'; g.fillRect(0, y, w, 1.4); const j = ((i * 97) % 200) + 20; g.fillRect(j, y, 1.4, 16); }
    for (let k = 0; k < 400; k++) { g.fillStyle = `rgba(60,36,18,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 8 + Math.random() * 30, 1); }
  });
  plank.wrapS = plank.wrapT = THREE.RepeatWrapping;
  const sail = canvas(128, 128, (g, w, h) => {
    g.fillStyle = '#efe6cf'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(150,130,95,0.22)'; g.fillRect(i * 16, 0, 1.5, h); }
    for (let k = 0; k < 300; k++) { g.fillStyle = `rgba(120,100,70,${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
    g.strokeStyle = 'rgba(110,90,60,0.5)'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2);
  });
  // the Saltwren's colours: deep sea-green with a white wren in flight and a gold edge (original)
  const flag = canvas(128, 80, (g, w, h) => {
    g.fillStyle = '#1d5a5a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d9b25e'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
    g.fillStyle = '#f4efe2'; g.beginPath(); g.moveTo(34, 44); g.quadraticCurveTo(52, 18, 70, 36); g.quadraticCurveTo(84, 22, 98, 30); g.quadraticCurveTo(82, 40, 72, 46); g.quadraticCurveTo(56, 58, 34, 44); g.fill();
    g.beginPath(); g.arc(70, 40, 5, 0, Math.PI * 2); g.fill();
  });
  const soft = canvas(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
  const smoke = canvas(128, 128, (g, w, h) => {
    for (let k = 0; k < 26; k++) { const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 50, rr = 18 + Math.random() * 30; const r = g.createRadialGradient(x, y, 0, x, y, rr); r.addColorStop(0, 'rgba(255,255,255,0.55)'); r.addColorStop(0.6, 'rgba(255,255,255,0.22)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }
  });
  TEX = { plank, sail, flag, soft, smoke };
  return TEX;
}

let MAT = null;
function materials() {
  if (MAT) return MAT;
  const T = textures();
  MAT = {
    hull: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02, side: THREE.DoubleSide }),
    deck: new THREE.MeshStandardMaterial({ map: T.plank, roughness: 0.85, color: '#c8a77c' }),
    wood: new THREE.MeshStandardMaterial({ color: '#5a3f28', roughness: 0.8 }),
    darkWood: new THREE.MeshStandardMaterial({ color: '#3b2a1c', roughness: 0.85 }),
    sail: new THREE.MeshStandardMaterial({ map: T.sail, roughness: 0.92, side: THREE.DoubleSide, color: '#f3ead6' }),
    rope: new THREE.LineBasicMaterial({ color: '#2c2219', transparent: true, opacity: 0.85 }),
    flag: new THREE.MeshStandardMaterial({ map: T.flag, roughness: 0.9, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: '#7a5a2a', emissive: '#ffa040', emissiveIntensity: 0.5, roughness: 0.3 }),
    gold: new THREE.MeshStandardMaterial({ color: '#b8893a', roughness: 0.45, metalness: 0.5 }),
  };
  return MAT;
}

function hullGeometry() {
  const NT = 46, NP = 18, pos = [], col = [], idx = [];
  const cBottom = new THREE.Color('#5b2d22'), cBoot = new THREE.Color('#1d1a17'), cWood = new THREE.Color('#4c3423'), cBand = new THREE.Color('#c39a4a'), cTop = new THREE.Color('#3a281b');
  for (let i = 0; i <= NT; i++) {
    const t = i / NT;
    for (let j = 0; j <= NP; j++) {
      const p = sectionPoint(t, (j / NP) * Math.PI); pos.push(...p);
      const y = p[1], sh = sheer(t);
      const c = y < -0.15 ? cBottom : y < 0.3 ? cBoot : Math.abs(y - (sh - 1.25)) < 0.22 ? cBand : y > sh - 0.35 ? cTop : cWood;
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) { const a = i * (NP + 1) + j, b = a + NP + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  // the transom: a fan closing the stern
  const c0 = pos.length / 3; pos.push(0, (sheer(0) + keelAt(0)) / 2, tToZ(0)); col.push(cWood.r, cWood.g, cWood.b);
  for (let j = 0; j < NP; j++) idx.push(c0, j + 1, j);
  idx.push(c0, 0, NP);                     // and the wedge between the two rails (else a V-shaped hole in the stern)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function deckGeometry() {
  const NT = 60, pos = [], uv = [], idx = [];
  for (let i = 0; i <= NT; i++) {
    const t = 0.01 + (i / NT) * 0.975, y = deckAt(t), w = Math.max(0.05, widthAt(t, y) - 0.12), z = tToZ(t);
    pos.push(-w, y, z, w, y, z); uv.push(0, z / 4, w / 2, z / 4);
  }
  for (let i = 0; i < NT; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const cyl = (r0, r1, h, seg = 8) => new THREE.CylinderGeometry(r1, r0, h, seg);
const place = (g, x, y, z, rx = 0, ry = 0, rz = 0) => { g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };

/**
 * Build a ship. Pure apart from three (no scene): -> { group, deckY(z), deckPoint(slot), update(t, wind) }.
 * Model space: bow toward +z, waterline y = 0, so `group.rotation.y = yaw` (our yaw 0 = +z).
 */
export function buildShip({ furled = false } = {}) {
  const M = materials(), group = new THREE.Group(); group.name = furled ? 'ship-moored' : 'ship';
  const add = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; group.add(m); return m; };
  add(hullGeometry(), M.hull);
  add(deckGeometry(), M.deck, false);
  // wood: masts, yards, bowsprit, rails, the wheel; dark: stern gallery
  const wood = [], dark = [], gold = [], glass = [];
  const MASTS = [{ t: 0.74, h: 25, yards: [[0.36, 15], [0.6, 12], [0.8, 8]] }, { t: 0.5, h: 29, yards: [[0.33, 17.5], [0.57, 14], [0.79, 9.5]] }, { t: 0.235, h: 20, yards: [[0.5, 10.5], [0.75, 7.5]] }];
  const masts = MASTS.map(m => { const z = tToZ(m.t), y0 = deckAt(m.t); return { ...m, z, y0, top: y0 + m.h }; });
  for (const m of masts) {
    wood.push(place(cyl(0.38, 0.16, m.h + 1.5, 10), 0, m.y0 + m.h / 2 - 0.5, m.z));
    dark.push(place(new THREE.BoxGeometry(2.6, 0.25, 2.2), 0, m.y0 + m.h * 0.52, m.z));        // the top (platform)
    for (const [f, w] of m.yards) wood.push(place(cyl(0.16, 0.16, w, 6), 0, m.y0 + m.h * f, m.z + 0.4, 0, 0, Math.PI / 2));
  }
  // bowsprit and jib-boom
  const bz = tToZ(0.985), by = sheer(1) - 0.4;
  wood.push(place(cyl(0.3, 0.14, 12, 8), 0, by + 1.6, bz + 5.2, Math.PI / 2 - 0.26));
  const sprit = [0, by + 3.2, bz + 10.8];
  // spanker gaff + boom on the mizzen
  const mz = masts[2];
  wood.push(place(cyl(0.12, 0.12, 9, 6), 0, mz.y0 + mz.h * 0.62, mz.z - 4.2, Math.PI / 2 - 0.42));
  wood.push(place(cyl(0.13, 0.13, 10, 6), 0, mz.y0 + 2.4, mz.z - 4.6, Math.PI / 2));
  // rails: posts and a cap along both sides, a cross rail at the quarterdeck and forecastle edges
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 30; i++) { const t = 0.02 + i / 30 * 0.94, y = sheer(t), w = widthAt(t, y - 0.05) - 0.06; pts.push(new THREE.Vector3(side * w, y + 0.12, tToZ(t))); }
    wood.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.11, 5, false));
  }
  for (const [t, up] of [[0.2, 1], [0.84, -1]]) {
    const y = Math.max(deckAt(t - 0.03), deckAt(t + 0.03)), w = widthAt(t, y) - 0.2;
    wood.push(place(new THREE.BoxGeometry(w * 2, 0.12, 0.14), 0, y + 1.0, tToZ(t) + up * 0.1));
    for (let k = -3; k <= 3; k++) wood.push(place(new THREE.BoxGeometry(0.1, 1.0, 0.1), k / 3 * w * 0.95, y + 0.5, tToZ(t) + up * 0.1));
  }
  // the wheel, at the front of the quarterdeck
  const wz = tToZ(0.17), wy = deckAt(0.17);
  const wheel = new THREE.TorusGeometry(0.75, 0.06, 6, 18); wheel.translate(0, wy + 1.35, wz);
  gold.push(wheel);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; gold.push(place(cyl(0.035, 0.035, 1.9, 4), 0, wy + 1.35, wz, 0, 0, a)); }
  dark.push(place(new THREE.BoxGeometry(0.5, 1.2, 0.5), 0, wy + 0.6, wz - 0.45));
  // stern gallery: a dark band with lit windows across the transom
  const sz = tToZ(0) - 0.05, sy = sheer(0) - 1.6;
  dark.push(place(new THREE.BoxGeometry(halfBeam(0) * 1.7, 1.5, 0.3), 0, sy, sz - 0.12));
  for (let k = -2; k <= 2; k++) { glass.push(place(new THREE.BoxGeometry(0.5, 0.62, 0.1), k * 1.25, sy + 0.05, sz - 0.32)); gold.push(place(new THREE.BoxGeometry(0.66, 0.08, 0.12), k * 1.25, sy + 0.41, sz - 0.33)); }
  dark.push(place(new THREE.BoxGeometry(0.35, 3.4, 1.6), 0, keelAt(0) + 1.5, tToZ(0) - 0.7));      // the rudder
  // lanterns on the taffrail
  for (const x of [-2.2, 2.2]) { dark.push(place(cyl(0.05, 0.05, 1.1, 4), x, sheer(0) + 0.5, tToZ(0.02))); glass.push(place(new THREE.BoxGeometry(0.42, 0.55, 0.42), x, sheer(0) + 1.2, tToZ(0.02))); }
  // a figurehead under the bowsprit: a gilded bird
  gold.push(place(new THREE.SphereGeometry(0.55, 8, 6).scale(0.7, 0.9, 1.6), 0, by - 0.6, bz + 0.7, -0.4));
  add(mergeGeometries(wood), M.wood);
  add(mergeGeometries(dark), M.darkWood);
  add(mergeGeometries(gold), M.gold, false);
  const lit = add(mergeGeometries(glass), M.glass, false);

  // ---- sails: ONE geometry, every sail's vertices updated in place each frame ----
  const sails = [], sp = [], suv = [], sidx = [];
  const addSail = (corners, nu = 8, nv = 6, opts = {}) => {
    // corners: [topLeft, topRight, bottomLeft, bottomRight] (model space); billow pushes along +z (forward) for square sails
    const base = sp.length / 3;
    for (let v = 0; v <= nv; v++) for (let u = 0; u <= nu; u++) {
      const a = corners[0], b = corners[1], c = corners[2], d = corners[3], fu = u / nu, fv = v / nv;
      const top = [lerp(a[0], b[0], fu), lerp(a[1], b[1], fu), lerp(a[2], b[2], fu)], bot = [lerp(c[0], d[0], fu), lerp(c[1], d[1], fu), lerp(c[2], d[2], fu)];
      sp.push(lerp(top[0], bot[0], fv), lerp(top[1], bot[1], fv), lerp(top[2], bot[2], fv)); suv.push(fu, 1 - fv);
    }
    for (let v = 0; v < nv; v++) for (let u = 0; u < nu; u++) { const a = base + v * (nu + 1) + u, b = a + nu + 1; sidx.push(a, b, a + 1, b, b + 1, a + 1); }
    sails.push({ base, nu, nv, rest: null, ...opts });
  };
  for (const m of masts) {
    const ys = m.yards.map(([f]) => m.y0 + m.h * f), ws = m.yards.map(([, w]) => w);
    for (let k = 0; k < ys.length; k++) {
      const top = ys[k] - 0.2, bottom = k === 0 ? m.y0 + 3.4 : ys[k - 1] + 0.35, wt = ws[k] * 0.46, wb = (k === 0 ? ws[k] * 0.5 : ws[k - 1] * 0.46);
      const h = furled ? Math.min(0.9, (top - bottom) * 0.12) : top - bottom;
      const z = m.z + 0.55;
      addSail([[-wt, top, z], [wt, top, z], [-wb * (furled ? 0.95 : 1), top - h, z], [wb * (furled ? 0.95 : 1), top - h, z]], 8, 6, { square: true, depth: furled ? 0.25 : 1.9 * (h / 7) });
    }
  }
  if (!furled) {
    // jibs: foremast to the bowsprit
    const fm = masts[0];
    for (const [f, back] of [[0.5, 0], [0.7, 1]]) {
      const head = [0, fm.y0 + fm.h * f, fm.z + 1.2], tack = [0, sprit[1] - back * 0.6 + 0.2, sprit[2] - back * 3.6], clew = [0, fm.y0 + 2.6 + back * 1.5, fm.z + 4.5 + back * 1.5];
      addSail([head, head, clew, tack], 6, 6, { jib: true, depth: 1.2 });
    }
    // the spanker: a quadrilateral aft of the mizzen
    addSail([[0, mz.y0 + mz.h * 0.5, mz.z - 0.4], [0, mz.y0 + mz.h * 0.66, mz.z - 8.2], [0, mz.y0 + 2.6, mz.z - 0.4], [0, mz.y0 + 2.6, mz.z - 9.3]], 6, 6, { jib: true, depth: 1.3 });
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  sg.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2));
  sg.setIndex(sidx); sg.computeVertexNormals();
  const rest = Float32Array.from(sp);
  const sailMesh = add(sg, M.sail);

  // ---- rigging (one LineSegments) ----
  const L = [];
  const line = (a, b) => L.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  for (const m of masts) {
    const edgeY = sheer(Math.max(0.05, m.t - 0.02)), ew = widthAt(m.t, edgeY - 0.1);
    for (const side of [-1, 1]) for (let k = 0; k < 4; k++) line([side * 0.3, m.y0 + m.h * (0.5 + k * 0.03), m.z], [side * (ew + 0.2), edgeY, m.z - 1.6 + k * 1.1]);
    for (const side of [-1, 1]) line([side * 0.2, m.top - 0.5, m.z], [side * (ew + 0.1), edgeY, m.z - 5.5]);        // backstays
    for (const [f, w] of m.yards) for (const side of [-1, 1]) line([0, Math.min(m.top, m.y0 + m.h * f + 3), m.z], [side * w * 0.48, m.y0 + m.h * f, m.z + 0.4]);   // lifts
  }
  line([0, masts[0].top - 0.3, masts[0].z], sprit);
  line([0, masts[0].y0 + masts[0].h * 0.7, masts[0].z], [0, sprit[1] - 0.4, sprit[2] - 3.6]);
  line([0, masts[1].top - 0.3, masts[1].z], [0, masts[0].y0 + masts[0].h * 0.55, masts[0].z]);
  line([0, masts[2].top - 0.3, masts[2].z], [0, masts[1].y0 + masts[1].h * 0.5, masts[1].z]);
  line(sprit, [0, by - 0.4, bz + 1]);                                                                         // bobstay
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(L, 3));
  const rig = new THREE.LineSegments(rg, M.rope); group.add(rig);

  // ---- a pennant at the main truck, an ensign on a staff at the stern ----
  const flags = [];
  const addFlag = (w, h, at, nu = 10) => {
    const g = new THREE.PlaneGeometry(w, h, nu, 2); g.translate(w / 2, 0, 0);
    const m = new THREE.Mesh(g, M.flag); m.position.set(...at); m.rotation.y = Math.PI / 2; group.add(m);   // streams aft (-z)
    flags.push({ m, rest: Float32Array.from(g.attributes.position.array), w });
  };
  addFlag(4.6, 1.3, [0, masts[1].top + 0.2, masts[1].z]);
  const staff = new THREE.Mesh(place(cyl(0.06, 0.06, 4, 5), 0, sheer(0) + 2, tToZ(0) - 0.5), M.darkWood); group.add(staff);
  addFlag(2.6, 1.7, [0, sheer(0) + 3.3, tToZ(0) - 0.5]);

  const deckY = z => deckAt(Math.max(0, Math.min(1, (z - HULL.stern) / (HULL.bow - HULL.stern))));
  /** Where a body stands on deck: slot 0 = you, mid-waist; party members in a little row beside you. */
  const deckPoint = slot => { const k = slot | 0, x = k ? (k % 2 ? 1.4 : -1.4) * Math.ceil(k / 2) : 0, z = -1.5 - (k ? 0.6 : 0); return new THREE.Vector3(x, deckY(z), z); };

  const pa = sg.attributes.position.array;
  function update(t, wind = 1) {
    for (const s of sails) {
      const nu = s.nu, nv = s.nv;
      for (let v = 0; v <= nv; v++) for (let u = 0; u <= nu; u++) {
        const k = (s.base + v * (nu + 1) + u) * 3, fu = u / nu, fv = v / nv;
        const belly = Math.sin(Math.PI * fu) * (s.jib ? Math.sin(Math.PI * fv) : Math.pow(Math.sin(Math.PI * Math.min(1, fv * 0.85 + 0.12)), 0.8));
        const flutter = Math.sin(t * 7.3 + fu * 5 + fv * 3 + s.base) * 0.05 * (1 - fv * 0.5);
        const d = (s.depth * (0.75 + 0.25 * wind) + flutter) * belly;
        if (s.jib) { pa[k] = rest[k] + d * 0.9; pa[k + 1] = rest[k + 1]; pa[k + 2] = rest[k + 2]; }
        else { pa[k] = rest[k]; pa[k + 1] = rest[k + 1]; pa[k + 2] = rest[k + 2] + d; }
      }
    }
    sg.attributes.position.needsUpdate = true;
    sg.computeVertexNormals();
    for (const f of flags) {
      const p = f.m.geometry.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) { const x = f.rest[i], fx = x / f.w; p[i + 2] = f.rest[i + 2] + Math.sin(t * 6.5 - fx * 5.5) * 0.32 * fx * wind; p[i + 1] = f.rest[i + 1] + Math.sin(t * 4.1 - fx * 3) * 0.08 * fx; }
      f.m.geometry.attributes.position.needsUpdate = true;
    }
  }
  if (furled) update(0, 0);
  return { group, deckY, deckPoint, update, lit, sails: sailMesh, length: HULL.bow - HULL.stern };
}

/** A wooden jetty from `from` (on the shore) to `to` (beside the berth), world metres; deck ~1.3 m above the sea. */
function buildPier(from, to, heightAt) {
  const M = materials(), dx = to[0] - from[0], dz = to[1] - from[1], len = Math.hypot(dx, dz) + 4, yaw = Math.atan2(dx, dz);
  const parts = [], posts = [];
  const shoreY = Math.max(0.4, heightAt ? heightAt(from[0], from[1]) : 0.6);
  const deckY = Math.max(1.3, shoreY + 0.15);
  parts.push(place(new THREE.BoxGeometry(3.2, 0.28, len), 0, deckY, len / 2 - 2));
  for (let s = 0; s <= len; s += 3.5) for (const x of [-1.45, 1.45]) posts.push(place(cyl(0.18, 0.18, deckY + 6, 6), x, deckY - (deckY + 6) / 2 + 0.6, s - 2));
  // bollards at the end
  for (const x of [-1.2, 1.2]) posts.push(place(cyl(0.22, 0.26, 0.7, 8), x, deckY + 0.45, len - 3));
  const g = new THREE.Group(); g.name = 'pier';
  const deck = new THREE.Mesh(mergeGeometries(parts), M.deck); deck.receiveShadow = true; deck.castShadow = true;
  const pp = new THREE.Mesh(mergeGeometries(posts), M.darkWood); pp.castShadow = true;
  g.add(deck, pp);
  g.position.set(from[0], 0, from[1]); g.rotation.y = yaw;
  return g;
}

// ---------------------------------------------------------------------------------------------------------------------
// the local sea

// the waves, ONE function for both stages: the vertex stage moves the grid, the fragment stage takes the normal per pixel
// (per-vertex normals on a grid this coarse far out turned every tilted facet into a flat white "ice floe" of sky)
const SEA_WAVES = /* glsl */`
uniform float uTime; uniform vec2 uOff; uniform float uFadeFrom; uniform float uRadius; uniform float uBase;
const int NW = 6;
// x = height, y = d/dx, z = d/dz, w = the short-wave height (crests, for foam)
vec4 seaWaves(vec2 p, float r) {
  vec2 dirs[NW]; float amp[NW]; float len[NW];
  dirs[0] = normalize(vec2(1.0, 0.35)); amp[0] = 0.42; len[0] = 46.0;
  dirs[1] = normalize(vec2(0.6, 1.0)); amp[1] = 0.3; len[1] = 31.0;
  dirs[2] = normalize(vec2(-0.7, 0.9)); amp[2] = 0.17; len[2] = 17.0;
  dirs[3] = normalize(vec2(0.95, -0.3)); amp[3] = 0.12; len[3] = 11.0;
  dirs[4] = normalize(vec2(-0.2, -1.0)); amp[4] = 0.06; len[4] = 6.3;
  dirs[5] = normalize(vec2(1.0, 1.0)); amp[5] = 0.55; len[5] = 120.0;
  float fade = (1.0 - smoothstep(uFadeFrom * 0.45, uFadeFrom, r)) * mix(0.3, 1.0, smoothstep(14.0, 70.0, r));
  float h = 0.0, dx = 0.0, dz = 0.0, hs = 0.0;
  for (int i = 0; i < NW; i++) {
    float k = 6.2831853 / len[i], w = sqrt(9.8 * k);
    float ph = dot(dirs[i], p) * k - w * uTime;
    float sn = amp[i] * sin(ph);
    h += sn;
    if (i >= 1 && i <= 4) hs += sn;
    float c = amp[i] * k * cos(ph);
    dx += dirs[i].x * c; dz += dirs[i].y * c;
  }
  // the whole local sea stands uBase metres up so its troughs never dip under the far horizon's flat sea (-0.5 m);
  // the lift fades out toward the rim, where the horizon's sea takes over
  float lift = uBase * (1.0 - smoothstep(uFadeFrom * 0.6, uRadius, r));
  // play-test 12 (#86, "seams in the water"): the six waves add up to 1.62 m, more than the 1.1 m lift, so where enough
  // troughs lined up the local sea dipped UNDER the world's own water (y 0 by every coast) and the darker sea under it
  // showed through as dark streaks along the wave fronts. The deepest troughs are now eased onto a floor 0.12 m above
  // the world's water (an exponential knee 0.3 m above the floor: unchanged above it, never below the floor).
  float y = h * fade + lift, floorY = lift - uBase + 0.12;
  if (y < floorY + 0.3) y = floorY + 0.3 * exp((y - floorY - 0.3) / 0.3);
  return vec4(y, dx * fade, dz * fade, hs * fade);
}`;
const SEA_VERT = /* glsl */`
varying vec3 vW; varying float vR; varying vec2 vP; varying vec2 vL;
#include <fog_pars_vertex>
${SEA_WAVES}
void main() {
  vec2 p = position.xz + uOff;
  float r = length(position.xz);
  vec4 wv = seaWaves(p, r);
  vec4 world = modelMatrix * vec4(position.x, wv.x, position.z, 1.0);
  vW = world.xyz; vR = r; vP = p; vL = position.xz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const SEA_FRAG = /* glsl */`
uniform vec3 uSun; uniform vec3 uSky; uniform vec3 uDeep; uniform vec3 uShallow; uniform float uDay;
uniform float uYaw; uniform float uRun; uniform float uWake; uniform float uHull;
varying vec3 vW; varying float vR; varying vec2 vP; varying vec2 vL;
#include <fog_pars_fragment>
${SEA_WAVES}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
// the hull half-beam at "along" metres from midships (bow +15, stern -16): halfBeam() in GLSL
float halfBeamAt(float along) {
  float t = (along + 16.0) / 31.0;
  if (t < 0.0 || t > 1.0) return -1.0;
  if (t < 0.46) return 4.7 * (0.74 + 0.26 * sin(t / 0.46 * 1.5707963));
  return 4.7 * pow(max(0.0, cos((t - 0.46) / 0.54 * 1.5707963)), 0.78);
}
void main() {
  // in the ship's own frame: no water inside the hull, and the wake
  vec2 fwd = vec2(sin(uYaw), cos(uYaw)), right = vec2(cos(uYaw), -sin(uYaw));
  float along = dot(vL, fwd), across = dot(vL, right), ax = abs(across);
  float hb = halfBeamAt(along);
  if (uHull > 0.5 && hb > 0.0 && ax < hb * 0.96) discard;
  vec4 wv = seaWaves(vP, vR);
  // small ripples on top of the waves, fading with distance so far water is calm and does not shimmer
  float camD = length(cameraPosition - vW);
  float near = 1.0 - smoothstep(60.0, 420.0, camD);
  float e = 0.6;
  float r0 = noise(vP * 0.9 + uTime * 0.3), rx = noise((vP + vec2(e, 0.0)) * 0.9 + uTime * 0.3), rz = noise((vP + vec2(0.0, e)) * 0.9 + uTime * 0.3);
  vec3 n = normalize(vec3(-wv.y - (rx - r0) * 0.35 * near, 1.0, -wv.z - (rz - r0) * 0.35 * near));
  n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(250.0, 1400.0, camD) * 0.75));
  float crest = clamp(wv.w / 0.65 * 0.5 + 0.5, 0.0, 1.0);
  vec3 v = normalize(cameraPosition - vW);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 sky = uSky * vec3(0.78, 0.86, 0.95);
  vec3 col = mix(uDeep, uShallow, crest * 0.6) * (0.3 + 0.7 * uDay);
  col = mix(col, sky * (0.35 + 0.65 * uDay), clamp(fres, 0.0, 0.6));
  float spec = pow(max(dot(reflect(-uSun, n), v), 0.0), 260.0) * 2.4 * uDay;
  col += vec3(1.0, 0.95, 0.85) * spec;
  float br = noise(vP * 0.45) * 0.65 + noise(vP * 1.7) * 0.35;
  float foam = smoothstep(0.86, 1.0, crest) * smoothstep(0.45, 0.8, br) * 0.45 * near;
  // the wake: a bow wave hugging the hull, two arms spreading at the ship's own angle, a churned trail astern
  float back = 15.5 - along;
  float wn = noise(vec2(across * 0.9, (back + uRun) * 0.35)) * 0.6 + noise(vec2(across * 2.7, (back + uRun) * 1.2)) * 0.4;
  float arm = exp(-pow((ax - (2.0 + back * 0.34)) / (0.8 + back * 0.03), 2.0)) * smoothstep(0.0, 4.0, back) * (1.0 - smoothstep(30.0, 260.0, back));
  float trail = exp(-pow(ax / (3.5 + back * 0.05), 2.0)) * smoothstep(26.0, 34.0, back) * (1.0 - smoothstep(60.0, 480.0, back));
  float side = (hb > 0.0) ? exp(-pow((ax - hb) / 1.3, 2.0)) * (0.55 + 0.45 * smoothstep(0.0, 10.0, along + 4.0)) : 0.0;
  float wake = clamp((arm * 0.85 + trail * 0.75 + side * 0.9) * smoothstep(0.25, 0.75, wn + 0.15) * uWake, 0.0, 1.0);
  foam = max(foam, wake);
  col = mix(col, vec3(0.93, 0.96, 0.98) * (0.35 + 0.65 * uDay), foam);
  float alpha = 1.0 - smoothstep(uFadeFrom, uRadius, vR);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function seaGeometry(R = VOYAGE.seaRadius) {
  const RINGS = 140, SEG = 160, pos = [0, 0, 0], idx = [];
  const rAt = i => R * Math.pow(i / RINGS, 2.6);       // dense by the ship (~1 m), coarse kilometres out
  for (let i = 1; i <= RINGS; i++) { const r = rAt(i); for (let j = 0; j < SEG; j++) { const a = j / SEG * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); } }
  for (let j = 0; j < SEG; j++) idx.push(0, 1 + ((j + 1) % SEG), 1 + j);
  for (let i = 1; i < RINGS; i++) for (let j = 0; j < SEG; j++) {
    const a = 1 + (i - 1) * SEG + j, b = 1 + (i - 1) * SEG + ((j + 1) % SEG), c = a + SEG, d = b + SEG;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R + 10);
  return g;
}
function createSea() {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uOff: { value: new THREE.Vector2() }, uBase: { value: VOYAGE.seaLift }, uFadeFrom: { value: VOYAGE.seaFadeFrom }, uRadius: { value: VOYAGE.seaRadius },
    uSun: { value: new THREE.Vector3(0.3, 0.8, 0.2) }, uSky: { value: new THREE.Color('#c9d9e6') }, uDeep: { value: new THREE.Color('#0b2d42') }, uShallow: { value: new THREE.Color('#1f6070') }, uDay: { value: 1 },
    uYaw: { value: 0 }, uRun: { value: 0 }, uWake: { value: 1 }, uHull: { value: 1 },
  }]);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: SEA_VERT, fragmentShader: SEA_FRAG, fog: true, transparent: true, depthWrite: true });
  const mesh = new THREE.Mesh(seaGeometry(), mat); mesh.name = 'voyage-sea'; mesh.frustumCulled = false; mesh.renderOrder = -1;
  return { mesh, uniforms };
}

// ---------------------------------------------------------------------------------------------------------------------
// gulls, spray, the brine-wyrm, the ash plume

function createGulls(n = 7) {
  const M = new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.8, side: THREE.DoubleSide });
  const tip = new THREE.MeshStandardMaterial({ color: '#4a4f55', roughness: 0.8, side: THREE.DoubleSide });
  const list = [];
  const group = new THREE.Group(); group.name = 'gulls';
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6).scale(1, 0.9, 2.6), M);
    const wing = s => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.18, s * 0.62, 0.04, 0.05, 0, 0, -0.16, s * 0.62, 0.04, 0.05, s * 1.0, -0.02, -0.12, 0, 0, -0.16], 3)); geo.computeVertexNormals(); const pivot = new THREE.Group(); pivot.add(new THREE.Mesh(geo, M)); const tp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 4).rotateZ(-s * Math.PI / 2), tip); tp.position.set(s * 1.05, -0.03, -0.12); pivot.add(tp); return pivot; };
    const L = wing(-1), R = wing(1);
    g.add(body, L, R);
    g.scale.setScalar(1.35);
    group.add(g);
    list.push({ g, L, R, r: 16 + (i * 7.3) % 28, h: 16 + (i * 5.1) % 22, w: 0.25 + (i % 3) * 0.08, ph: i * 1.7, flap: 3.2 + (i % 4) * 0.6, dir: i % 2 ? 1 : -1 });
  }
  return {
    group,
    update(t) {
      for (const q of list) {
        const a = q.ph + t * q.w * q.dir;
        q.g.position.set(Math.cos(a) * q.r, q.h + Math.sin(t * 0.6 + q.ph) * 2.2, Math.sin(a) * q.r * 1.3 + 4);
        q.g.rotation.set(0, -a * q.dir + (q.dir > 0 ? Math.PI : 0), Math.sin(t * 0.6 + q.ph) * 0.25 * q.dir);
        const glide = Math.sin(t * 0.37 + q.ph) > 0.35;
        const f = glide ? 0.12 : Math.sin(t * q.flap * 2 + q.ph) * 0.65;
        q.L.rotation.z = -f; q.R.rotation.z = f;
      }
    },
  };
}

function createSpray(n = 140) {
  const T = textures();
  const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), life = new Float32Array(n).fill(-1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: T.soft, color: '#ffffff', size: 1.3, transparent: true, opacity: 0.75, depthWrite: false, sizeAttenuation: true });
  const pts = new THREE.Points(g, mat); pts.name = 'spray'; pts.frustumCulled = false;
  let acc = 0, k = 0;
  return {
    points: pts,
    update(dt, rate, bow = 15.5) {
      acc += dt * rate;
      while (acc > 1) { acc -= 1; const i = k++ % n, side = Math.random() < 0.5 ? -1 : 1; life[i] = 0.9 + Math.random() * 0.7; pos[i * 3] = side * (0.4 + Math.random() * 1.2); pos[i * 3 + 1] = 0.6; pos[i * 3 + 2] = bow - Math.random() * 3; vel[i * 3] = side * (2 + Math.random() * 3.5); vel[i * 3 + 1] = 3 + Math.random() * 4; vel[i * 3 + 2] = -1.5 - Math.random() * 3; }
      for (let i = 0; i < n; i++) {
        if (life[i] < 0) { pos[i * 3 + 1] = -50; continue; }
        life[i] -= dt; vel[i * 3 + 1] -= 9.8 * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < -0.2) life[i] = -1;
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}

/** The brine-wyrm: a ridged sea serpent, five coils that arch out of the water in turn, a finned head, splashes. */
function createSerpent() {
  const skin = new THREE.MeshStandardMaterial({ color: '#1f4a45', roughness: 0.55, metalness: 0.1 });
  const belly = new THREE.MeshStandardMaterial({ color: '#7f9a6a', roughness: 0.6 });
  const fin = new THREE.MeshStandardMaterial({ color: '#7a2f2a', roughness: 0.6, side: THREE.DoubleSide });
  const group = new THREE.Group(); group.name = 'brine-wyrm'; group.visible = false;
  const coils = [];
  for (let i = 0; i < 5; i++) {
    const r = 3.6 - i * 0.35, tube = 1.15 - i * 0.12;
    const c = new THREE.Group();
    const arch = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, 24, Math.PI), skin);
    c.add(arch);
    // ridge fins along the top of the coil
    for (let k = 1; k < 6; k++) {
      const a = k / 6 * Math.PI, sp = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.5 - i * 0.12, 4), fin);
      sp.position.set(Math.cos(a) * r, Math.sin(a) * r + tube * 0.9, 0); sp.rotation.z = a - Math.PI / 2; c.add(sp);
    }
    c.rotation.y = Math.PI / 2;           // the arch stands along the line of travel (local z)
    group.add(c);
    coils.push({ c, r, i });
  }
  // the head: a long wedge with a jaw, horns and a red frill
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8).scale(1, 0.8, 2.2), skin);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.95, 10, 6).scale(0.9, 0.45, 1.9), belly); jaw.position.set(0, -0.55, 0.35);
  const frill = new THREE.Mesh(new THREE.CircleGeometry(1.9, 10, Math.PI * 0.05, Math.PI * 0.9), fin); frill.position.set(0, 0.45, -1.5); frill.rotation.x = -0.35;
  const eyeM = new THREE.MeshStandardMaterial({ color: '#f2d24a', emissive: '#b88a1a', emissiveIntensity: 0.6 });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 6), eyeM); e.position.set(s * 0.72, 0.35, 1.0); head.add(e); const h = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.4, 5), belly); h.position.set(s * 0.5, 0.95, -0.4); h.rotation.x = -1.0; head.add(h); }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 4.5, 10), skin); neck.position.set(0, -1.6, -1.4); neck.rotation.x = 0.55;
  head.add(skull, jaw, frill, neck);
  group.add(head);
  const splashes = createSpray(90); splashes.points.material.size = 2.4; group.add(splashes.points);
  return {
    group,
    /** u: 0..1 through the breach. */
    update(u, dt) {
      group.visible = u > 0 && u < 1;
      if (!group.visible) return;
      const gap = 7.5;
      let up = 0;
      for (const q of coils) {
        const lu = (u - q.i * 0.07) / 0.72;          // each coil rises and falls a little after the one before
        const rise = Math.sin(Math.PI * Math.max(0, Math.min(1, lu)));
        q.c.position.set(0, -q.r - 1.6 + rise * (q.r + 1.1), -q.i * gap - 4);
        up += rise;
      }
      const hu = Math.max(0, Math.min(1, (u + 0.03) / 0.7));
      const hr = Math.sin(Math.PI * hu);
      head.position.set(0, -4 + hr * 7.2, 2.4 + hu * 3);
      head.rotation.x = -0.35 + hr * 0.45 - hu * 0.6;
      splashes.update(dt, up > 0.2 ? 90 : 0, 3);
    },
  };
}

/** Vharlen's ash: a leaning column of slow smoke over the peak, and a dull red glow in the crater. */
function createPlume() {
  const T = textures(), group = new THREE.Group(); group.name = 'ash-plume';
  const puffs = [];
  for (let i = 0; i < 46; i++) {
    const m = new THREE.SpriteMaterial({ map: T.smoke, color: '#4a423d', transparent: true, opacity: 0.0, depthWrite: false, fog: false });
    const s = new THREE.Sprite(m); group.add(s);
    puffs.push({ s, m, k: i / 46, spin: (i * 0.77) % 1 });
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.soft, color: '#d8481c', transparent: true, opacity: 0.3, depthWrite: false, fog: false }));
  glow.scale.set(340, 160, 1); group.add(glow);
  return {
    group,
    /** at = the peak {x, y, z}; fogFar for the distance tint; vis 0..1 (fades in as it comes into view). */
    update(t, at, cam, vis = 1, night = 0) {
      group.position.set(at.x, at.y, at.z);
      glow.position.set(0, 30, 0); glow.material.opacity = (0.08 + 0.6 * night) * vis;
      const d = cam ? Math.hypot(cam.x - at.x, cam.z - at.z) : 8000;
      const haze = Math.min(0.55, d / 40000);
      for (const p of puffs) {
        const k = (p.k + t * 0.012) % 1;        // each puff climbs the column and is reborn at the vent
        const h = 60 + k * 2300, lean = k * k * 1700;
        p.s.position.set(lean * 0.8 + Math.sin(p.k * 40) * 120 * k, h, lean * 0.35 + Math.cos(p.k * 31) * 110 * k);
        const sz = 340 + k * 1600;
        p.s.scale.set(sz, sz * 0.8, 1);
        p.m.rotation = p.spin * 6 + t * 0.02;
        p.m.opacity = vis * Math.min(1, k * 6) * Math.pow(1 - k, 0.7);
        const sh = 1 - night * 0.6, base = lerp(0.2, 0.34, k);
        p.m.color.setRGB(lerp(base, 0.62, haze) * sh, lerp(base * 0.92, 0.64, haze) * sh, lerp(base * 0.86, 0.68, haze) * sh);
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------

export function createShipVoyage(scene, { view, camera, actors, travel, hud, controls, horizon = () => null, ws = null, worldUi = null, journal = () => null, selfId = () => null, compile = null } = {}) {
  const root = new THREE.Group(); root.name = 'ships'; scene.add(root);
  const ui = createShipTravel({ hud, net: () => NET, onOpen: () => worldUi?.closeDialog?.(), journal, onSkip: () => skip() });
  let NET = null, DATA = null;
  const moored = new Map();        // harbour id -> { ship, pier }
  let V = null;                    // the voyage in progress
  const stats = { voyages: 0, moored: 0 };

  // ---- data + the moored ships ----
  const dataP = fetch(new URL('../../data/provinces/ships.json', import.meta.url)).then(r => (r.ok ? r.json() : null)).catch(() => null).then(d => { DATA = d; buildMoored(); return d; });
  function buildMoored() {
    if (!DATA) return;
    for (const h of DATA.harbours || []) {
      if (!h.berth || moored.has(h.id)) continue;
      const s = buildShip({ furled: true });
      s.group.position.set(h.berth.x, 0, h.berth.z); s.group.rotation.y = h.berth.yaw || 0;
      root.add(s.group);
      let pier = null;
      if (h.pier) { pier = buildPier(h.pier.from, h.pier.to, (x, z) => horizon()?.heightAt?.(x, z) ?? 0.6); root.add(pier); }
      moored.set(h.id, { ship: s, pier, h });
      stats.moored++;
      if (compile) { try { compile(s.group); } catch { /* drawn anyway */ } }
    }
  }

  // ---- the voyage ----
  function startVoyage(m) {
    if (!m || !Array.isArray(m.path) || m.path.length < 2) return false;
    endVoyage(true);
    const pts = m.path.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
    const L = curve.getLength();
    const T = Math.max(6, (m.ms || 40000) / 1000);
    const ship = buildShip({ furled: false });
    const sea = createSea(), gulls = createGulls(), spray = createSpray(), serpent = createSerpent(), plume = createPlume();
    const frame = new THREE.Group(); frame.name = 'voyage-frame';           // yaw-only frame that follows the ship
    frame.add(gulls.group, spray.points, serpent.group);
    serpent.group.position.set(-42, 0, 58);                                  // off the starboard bow (-x: three's +x is port when heading +z)
    serpent.group.rotation.y = 0.3; serpent.group.scale.setScalar(2.3);
    root.add(ship.group, sea.mesh, frame, plume.group);
    const fromBerth = m.berth?.from, toBerth = m.berth?.to;
    // our ship takes the moored one's place at both ends
    for (const id of [m.from?.id, m.to?.id]) { const q = moored.get(id); if (q) q.ship.group.visible = false; }
    const tan0 = curve.getTangentAt(0.001), tanN = curve.getTangentAt(0.999);
    V = {
      m, curve, L, T, ship, sea, gulls, spray, serpent, plume, frame, profile: voyageProfile(L, T),
      t0: performance.now(), t: 0, s: 0, x: pts[0].x, z: pts[0].z, yaw: fromBerth?.yaw ?? Math.atan2(tan0.x, tan0.z),
      yaw0: fromBerth ? fromBerth.yaw : Math.atan2(tan0.x, tan0.z), yawEnd: arrivalYaw(toBerth, Math.atan2(tanN.x, tanN.z)),
      run: 0, offX: 0, offZ: 0, cam: null, crew: Array.isArray(m.crew) ? m.crew : [], volcano: findVolcano(m.volcano || DATA?.volcano), arrived: false, poseAt: -1,
      fog: { near: scene.fog?.near, far: scene.fog?.far }, preloaded: false, serpentSaid: false,
      tan0x: tan0.x, tan0z: tan0.z, tanNx: tanN.x, tanNz: tanN.z,
    };
    // the deck and the far rim: compile now so the first frame at sea does not stutter
    if (compile) { try { compile(ship.group); } catch { /* drawn anyway */ } }
    controls?.hold(true); controls?.stop?.();
    stats.voyages++;
    ui.voyageStart({ from: m.from?.name, to: m.to?.name, ms: T * 1000, skipMs: m.skipMs ?? 5000 });
    hud?.toast?.(`The ${shipName(m)} casts off for ${m.to?.name || 'the far shore'}.`, 'info');
    return true;
  }
  const shipName = m => String(m.ship || DATA?.service?.ship || 'ship').replace(/^the\s+/i, '');
  function findVolcano(v) {
    if (!v) return null;
    const hz = horizon();
    let best = { x: v.x, z: v.z, y: 300 };
    if (hz?.heightAt) {
      let top = -Infinity; const R = v.searchM || 1400;
      for (let dz = -R; dz <= R; dz += 64) for (let dx = -R; dx <= R; dx += 64) { if (dx * dx + dz * dz > R * R) continue; const y = hz.heightAt(v.x + dx, v.z + dz); if (y > top) { top = y; best = { x: v.x + dx, z: v.z + dz, y }; } }
    }
    return best;
  }
  /** The ship's place at voyage time t (s): position along the route, heading, heave/roll/pitch. Cheap; once a frame. */
  function pose() {
    if (!V) return null;
    // ONE pose a frame (play-test 11, found by the Coast stream): the frame's own clock, not performance.now() — the actors
    // ask for the deck (ridePos) and the ship is placed later in the same frame, and at the crossing's ~1 km/s two clocks a
    // few ms apart drew you up to 11 m off the deck (worst on a turn of the route)
    const tl = typeof document !== 'undefined' ? document.timeline?.currentTime : null;
    const now = Number.isFinite(tl) ? tl : performance.now();
    if (V.poseAt === now) return V;
    V.poseAt = now;
    const t = Math.min(V.T + 30, (now - V.t0) / 1000);
    const dt = Math.max(0, Math.min(0.1, t - V.t));
    V.t = t;
    V.s = V.profile.at(t);
    const u = Math.max(0, Math.min(1, V.s / V.L));
    const p = V.curve.getPointAt(u), tan = V.curve.getTangentAt(Math.min(0.9995, Math.max(0.0005, u)));
    V.x = p.x; V.z = p.z;
    // heading: the berth's at cast-off, the route's at sea, the far berth's as she comes alongside
    let yaw = Math.atan2(tan.x, tan.z);
    // #86: the turns take as long as they are big (TURN_SEC_PER_RAD), and the arrival turn is never more than a quarter
    // turn (arrivalYaw: she comes alongside bow-in or bow-out, whichever is nearer the way she is going)
    const wa = turnSec(V.yaw0, Math.atan2(V.tan0x, V.tan0z)), wb = turnSec(V.yawEnd, Math.atan2(V.tanNx, V.tanNz));
    const a = smooth(t / wa), b = smooth((t - (V.T - wb)) / wb);
    yaw = V.yaw0 + angDelta(V.yaw0, yaw) * a;
    yaw = yaw + angDelta(yaw, V.yawEnd) * b;
    V.yaw += angDelta(V.yaw, yaw) * Math.min(1, dt * 2.5 + (V.yaw === yaw ? 1 : 0));
    if (t < 0.05) V.yaw = yaw;
    const sail = smooth(t / 4) * (1 - smooth((t - V.T + 2) / 2));
    // Z49: the water runs past at the ship's OWN speed (it used to run at a fixed 11 m/s while the land rushed past at
    // hundreds — the sea seemed to flow the wrong way); capped where the land is far off and waves would streak
    const flow = dt * Math.min(VOYAGE.flowMaxMps, Math.max(VOYAGE.visualMps * 0.3, V.profile.speed(t))) * Math.max(0.15, sail);
    V.run += flow;
    // play-test 12 (#86: "as the boat turns in … the water appears to move incredibly fast to the side"): the sea's offset
    // was (sin yaw, cos yaw) x the WHOLE distance run — kilometres — so any turn swung the entire wave field round a circle
    // that big in a second. The offset is now the distance sailed added up step by step along each step's own heading:
    // a turn changes only where the NEXT metres go.
    V.offX += Math.sin(V.yaw) * flow; V.offZ += Math.cos(V.yaw) * flow;
    const g = V.ship.group;
    g.position.set(V.x, VOYAGE.seaLift + 0.3 * Math.sin(t * 1.05) - 0.15, V.z);
    g.rotation.set(0.022 * Math.sin(t * 1.27 + 1), V.yaw, 0.045 * Math.sin(t * 0.83) + 0.05 * sail, 'YXZ');
    g.updateMatrixWorld(true);
    V.frame.position.set(V.x, 0, V.z); V.frame.rotation.set(0, V.yaw, 0);
    V.frame.updateMatrixWorld(true);
    V.sail = sail;
    return V;
  }
  const _v = new THREE.Vector3();
  /** Where a body in deck slot k stands, in the world. */
  function deckWorld(k) { const p = V.ship.deckPoint(k); return _v.copy(p).applyMatrix4(V.ship.group.matrixWorld).clone(); }

  function ridePos(drawn) {
    if (!V) return drawn;
    pose();
    const me = selfId();
    // party members who sailed with you stand on deck too (their server bodies wait on the quay)
    let slot = 1;
    for (const id of V.crew) {
      if (id === me) continue;
      const a = actors?.get(id); if (!a) continue;
      const w = deckWorld(slot++); a.still = { x: w.x, y: w.y, z: w.z, yaw: V.yaw, speed: 0 }; a.voyageStill = true;
    }
    const w = deckWorld(0);
    return { ...drawn, x: w.x, y: w.y, z: w.z, riding: true, yaw: V.yaw };
  }

  function endVoyage(quiet = false) {
    if (!V) return;
    const v = V; V = null;
    for (const o of [v.ship.group, v.sea.mesh, v.frame, v.plume.group]) { root.remove(o); o.traverse?.(n => { if (n.isMesh || n.isPoints || n.isLineSegments || n.isSprite) { n.geometry?.dispose?.(); if (n.material && !Object.values(MAT || {}).includes(n.material)) n.material.dispose?.(); } }); }
    for (const q of moored.values()) q.ship.group.visible = true;
    for (const id of v.crew) { const a = actors?.get(id); if (a && a.voyageStill) { a.still = null; a.voyageStill = false; } }
    if (scene.fog && v.fog.far) { scene.fog.near = v.fog.near; scene.fog.far = v.fog.far; }
    controls?.hold(false);
    ui.voyageEnd();
    if (!quiet) { /* the arrival banner says the rest */ }
  }
  function skip() {
    if (!V || !NET) return;
    if (typeof NET._raw === 'function') NET._raw('game', JSON.stringify({ t: 'ship', op: 'skip' }));
  }

  // ---- the frame ----
  const _cam = new THREE.Vector3(), _look = new THREE.Vector3();
  function update(dt, elapsed = 0) {
    for (const q of moored.values()) if (q.ship.group.visible) { const c = camera.position; if (Math.hypot(c.x - q.h.berth.x, c.z - q.h.berth.z) < 1500) { q.ship.group.position.y = 0.2 * Math.sin(elapsed * 0.9 + q.h.berth.x); q.ship.group.rotation.z = 0.02 * Math.sin(elapsed * 0.7); q.ship.update(elapsed, 0.2); } }
    if (!V) return;
    pose();
    const v = V, t = v.t;
    // the sea, the ship's own motion
    v.sea.mesh.position.set(v.x, 0, v.z);
    const U = v.sea.uniforms;
    U.uTime.value = t; U.uOff.value.set(v.offX, v.offZ);      // #86: the distance sailed, as a point (see pose())
    if (view?.sunDir) U.uSun.value.copy(view.sunDir);
    if (scene.fog) U.uSky.value.copy(scene.fog.color);
    const day = Math.max(0.12, Math.min(1, (view?.sun?.intensity ?? 2.4) / 2.4));
    U.uDay.value = day;
    v.ship.update(t, 0.6 + 0.4 * v.sail);
    v.ship.lit.material.emissiveIntensity = 0.35 + (1 - day) * 2.4;
    U.uYaw.value = v.yaw; U.uRun.value = v.run; U.uWake.value = Math.max(0.15, v.sail);
    v.gulls.update(t);
    v.spray.update(dt, 34 * v.sail);
    // the brine-wyrm breaches once, off the starboard bow
    const su = (t - v.T * VOYAGE.serpentAt) / VOYAGE.serpentSec;
    v.serpent.update(su, dt);
    if (su > 0.05 && !v.serpentSaid) { v.serpentSaid = true; hud?.toast?.('A brine-wyrm breaks the surface off the starboard bow!', 'info'); }
    // Vharlen's smoke: always over its peak; it rises out of the haze as you close
    if (v.volcano) {
      const d = Math.hypot(v.volcano.x - v.x, v.volcano.z - v.z);
      v.plume.update(elapsed, v.volcano, camera.position, Math.max(0.15, 1 - smooth((d - 9000) / 12000)), 1 - day);
    }
    // see the far island: the fog drawn back for the crossing, eased in and out
    if (scene.fog) { const k = smooth(t / 3) * (1 - smooth((t - v.T + 1.5) / 1.5)); scene.fog.near = lerp(v.fog.near ?? 220, VOYAGE.fogNear, k); scene.fog.far = lerp(v.fog.far ?? 7000, VOYAGE.fogFar, k); }
    // the camera
    voyageCamera(dt);
    // load the far shore's ground before we get there
    if (!v.preloaded && t > v.T * 0.55) { v.preloaded = true; preload(v.m.to); }
    ui.voyageTick(t * 1000);
    // the arrival never came: do not leave you at sea
    if (t * 1000 > v.T * 1000 + VOYAGE.arriveGraceMs) { endVoyage(); if (travel?.covered) travel.reveal(); hud?.toast?.('The ship lost the tide. You are back where you were.', 'warn'); }
  }
  /** Shots of the crossing: over your shoulder as she casts off, then wide astern, a swing out to starboard for the
   *  wyrm, and back astern looking ahead at the far harbour as she comes in. All in the ship's yaw frame, eased. */
  function voyageCamera(dt) {
    const v = V, t = v.t, T = v.T, deck = v.ship.deckY(0);
    const keys = [
      [0, [2.6, deck + 3.0, -9.5], [0, deck + 2.2, 10]],
      [3.5, [-14, deck + 9, -30], [0, deck + 4, 20]],
      [T * 0.28, [-34, 18, -58], [0, 8, 60]],
      [T * VOYAGE.serpentAt - 1.5, [16, 11, -40], [-36, 6, 62]],
      [T * VOYAGE.serpentAt + VOYAGE.serpentSec + 0.5, [20, 12, -44], [-24, 6, 90]],
      [T - 9, [-26, 16, -52], [0, 10, 220]],
      [T - 1.5, [-18, 13, -44], [0, 6, 160]],
      [T + 30, [-18, 13, -44], [0, 6, 160]],
    ];
    let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const [ta, pa, la] = keys[i], [tb, pb, lb] = keys[i + 1], f = smooth((t - ta) / Math.max(0.01, tb - ta));
    const cos = Math.cos(v.yaw), sin = Math.sin(v.yaw);
    const toWorld = (p, out) => out.set(v.x + p[0] * cos + p[2] * sin, p[1], v.z - p[0] * sin + p[2] * cos);
    toWorld([lerp(pa[0], pb[0], f), lerp(pa[1], pb[1], f), lerp(pa[2], pb[2], f)], _cam);
    toWorld([lerp(la[0], lb[0], f), lerp(la[1], lb[1], f), lerp(la[2], lb[2], f)], _look);
    camera.position.copy(_cam);
    camera.lookAt(_look);
  }
  function preload(to) {
    if (!to) return;
    const h = (DATA?.harbours || []).find(x => x.id === to.id);
    const dock = h?.dock || h?.master;
    if (dock && ws?.terrain?.zoneAt?.(dock.x, dock.z)) { try { ws.whenReady(dock.x, dock.z); } catch { /* it loads on arrival */ } return; }
    // another province: warm the browser cache with the arrival zone's files so the ground is there the moment you land
    if (h?.zone) for (const f of ['terrain.bin', 'scatter.bin', 'placements.json', 'nav.bin']) fetch(new URL(`../../data/zones/${encodeURIComponent(h.zone)}/${f}`, import.meta.url)).then(r => r.ok && r.arrayBuffer()).catch(() => null);
  }

  function wire(net) {
    NET = net;
    ui.wire(net);
    net.on('shipSail', m => { dataP.then(() => startVoyage(m)); });
    net.on('shipR', r => {
      if (r.op !== 'arrive') return;
      if (r.ok === false) { endVoyage(); hud?.toast?.(r.msg || 'The voyage was called off.', 'warn'); return; }
      if (V) travel?.cover?.(`Coming ashore at ${r.name || 'the harbour'}…`);
    });
    net.on('relocate', () => { if (V) travel?.cover?.(`Coming ashore at ${V.m.to?.name || 'the harbour'}…`); });
    net.on('joined', () => { if (V) { const name = V.m.to?.name; endVoyage(); if (name && travel?.covered) travel.cover(`Coming ashore at ${name}…`); } });
  }

  return {
    root, ui, wire, update, ridePos, startVoyage, endVoyage, moored, stats, ready: dataP,
    get active() { return !!V; },
    get state() { return V ? { t: V.t, total: V.T, s: V.s, L: V.L, x: V.x, z: V.z, yaw: V.yaw, vMax: V.profile.vMax, serpent: V.serpent.group.visible, volcano: V.volcano } : null; },
    /** Tests: jump the voyage clock to `sec` seconds in. */
    seek(sec) { if (V) { V.t0 = performance.now() - sec * 1000; V.t = Math.max(0, sec - 0.02); V.poseAt = -1; } },
  };
}
