// Traffic for Arcline: hover-cars, trams, maglev pods and cargo haulers (Arcline PLAN §0 Q17: moving vehicles on
// roads + mass transit). Small 3D models baked to 2D frames per screen direction (8), like the creatures.
//   userData.pose(anim, phase 0..1, heading) — 'drive' (4 frames, loop): a gentle hover bob and a shimmer in the
//   underglow. heading = world angle (atan2(dz, dx)); the model's nose points along +x before turning.
// Head and tail lights, underglow and lit windows use glow materials, so traffic draws streaks of light at night.
// Paint: `paint` 0 picks a colour from the seed; 1… pick one by name.
import * as THREE from 'three';
import { addRecipes } from './buildings.js';
import { bodyMat, neonMat } from './shapes.js';
import { shade } from './materials.js';

// ---------- parts ----------
const G = new Map();
const geo = (k, make) => { if (!G.has(k)) G.set(k, make()); return G.get(k); };
function put(parent, g, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; }
function cbox(parent, w, h, d, m, x = 0, y = 0, z = 0) { return put(parent, geo(`b${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}`, () => new THREE.BoxGeometry(w, h, d)), m, x, y, z); }
function ball(parent, r, m, x, y, z, sx = 1, sy = 1, sz = 1, s = 20) {
  const o = put(parent, geo(`sp${s}`, () => new THREE.SphereGeometry(1, s, Math.ceil(s * 0.6))), m, x, y, z); o.scale.set(r * sx, r * sy, r * sz); return o;
}
function disc(parent, r, h, m, x, y, z, s = 14) { return put(parent, geo(`c${r.toFixed(4)}:${h.toFixed(4)}:${s}`, () => new THREE.CylinderGeometry(r, r, h, s)), m, x, y, z); }
/** A side profile (x along the length, y up) pushed out sideways to `depth`, centred on z = 0, softly bevelled. */
function profile(parent, key, pts, depth, m, bevel = 0.006) {
  const g = geo(`prof:${key}`, () => {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const e = new THREE.ExtrudeGeometry(sh, { depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
    e.translate(0, 0, -(depth - bevel * 2) / 2); e.computeVertexNormals(); return e;
  });
  return put(parent, g, m);
}

// ---------- materials ----------
const C = (color, metal = 0.3, rough = 0.4) => bodyMat('concrete', 0, { color, metal, rough });
const winCache = new Map();
/** Glass by day, warmly lit cabins at night. */
function windowMat(glass = '#2c4760', lit = '#ffd9a0') {
  const k = glass + lit;
  if (!winCache.has(k)) {
    const m = new THREE.MeshStandardMaterial({ color: glass, emissive: lit, emissiveIntensity: 1, metalness: 0.5, roughness: 0.15 });
    m.userData.glow = true; m.userData.dayGlow = 0; winCache.set(k, m);
  }
  return winCache.get(k);
}
const DARK = C('#23272e', 0.3, 0.6), TRIM = C('#5a636e', 0.4, 0.45), GLASS = windowMat('#2a4a66', '#2f4f6e');   // cabins: only a faint dashboard glow
const HEAD = '#eef8ff', TAIL = '#ff2a3a', AMBER = '#ffb02e';
const PAINTS = [null, ['Crimson', '#d23a30'], ['Pearl', '#e9ebe8'], ['Cobalt', '#2f6fd0'], ['Saffron', '#f0b323'], ['Night', '#262a33'], ['Jade', '#3aa56a'], ['Orchid', '#8a55d4'], ['Copper', '#c4703e'], ['Steel', '#9aa3ad']];
const UNDER = ['#3ff0ff', '#ff4fd8', '#7dff6a', '#ffb02e', '#a77bff'];
const paintParam = { key: 'paint', label: 'Paint', min: 0, max: PAINTS.length - 1, step: 1, def: 0, names: ['From seed', ...PAINTS.slice(1).map(p => p[0])] };
function paintOf(p, from = PAINTS.length - 1) { return p.paint ? PAINTS[p.paint][1] : PAINTS[1 + (p.seed * 7 + 3) % from][1]; }

/** Wrap draw(group, look, t) into a posable model. */
function vehicle(makeLook, draw) {
  return p => {
    const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
    const look = makeLook(p);
    g.userData.pose = (anim, t, heading = 0) => { body.clear(); draw(body, look, ((t % 1) + 1) % 1, p); body.rotation.y = -heading; };
    g.userData.pose('drive', 0, 0);
    return g;
  };
}
/** Underglow brightness shimmers through the drive cycle. */
const under = (color, t, k = 0) => neonMat(shade(color, 0.18 * Math.sin((t + k) * Math.PI * 2) - 0.05), 0.35);
const bob = (t, a = 0.005) => a * Math.sin(t * Math.PI * 2);

// =====================================================================================================================
function carLook(p) { const paint = paintOf(p); return { paint: C(paint, 0.45, 0.3), dark: C(shade(paint, -0.4), 0.4, 0.4), under: UNDER[(p.seed * 3) % UNDER.length] }; }
function drawCar(root, L, t) {
  const y = 0.034 + bob(t);
  const B = new THREE.Group(); B.position.y = y; root.add(B);
  // lower hull: a wedge, nose low
  profile(B, 'car', [[-0.14, 0], [0.12, 0], [0.145, 0.016], [0.138, 0.036], [0.07, 0.05], [-0.115, 0.054], [-0.143, 0.042]], 0.124, L.paint);
  // canopy: glass all round with a painted roof and pillars
  profile(B, 'carglass', [[0.068, 0.046], [0.022, 0.084], [-0.074, 0.087], [-0.112, 0.05]], 0.104, GLASS, 0.004);
  const roof = cbox(B, 0.085, 0.006, 0.096, L.paint, -0.03, 0.09, 0); roof.rotation.z = 0.02;
  // side skirts + rear fins
  for (const s of [1, -1]) { cbox(B, 0.24, 0.014, 0.008, L.dark, 0, 0.012, s * 0.064); const fin = cbox(B, 0.04, 0.03, 0.006, L.paint, -0.125, 0.065, s * 0.045); fin.rotation.z = 0.5; }
  // lights: twin headlights + a slim bar, a full-width tail light
  for (const s of [1, -1]) cbox(B, 0.006, 0.012, 0.03, neonMat(HEAD, 0.75), 0.143, 0.025, s * 0.038);
  cbox(B, 0.004, 0.004, 0.06, neonMat(L.under, 0.6), 0.147, 0.012, 0);
  cbox(B, 0.006, 0.009, 0.11, neonMat(TAIL, 0.6), -0.146, 0.04, 0);
  // hover: underglow plate + four pads
  cbox(root, 0.27, 0.004, 0.138, under(L.under, t), 0, y - 0.004, 0);     // peeks out round the hull
  for (const [x, z] of [[0.08, 0.045], [0.08, -0.045], [-0.09, 0.045], [-0.09, -0.045]]) disc(B, 0.018, 0.008, DARK, x, -0.002, z);
}

function tramLook(p) { const paint = paintOf(p); return { paint: C(paint, 0.35, 0.35), body: C('#e4e7ea', 0.3, 0.4), under: UNDER[(p.seed * 3 + 1) % UNDER.length] }; }
function drawTram(root, L, t) {
  const y = 0.022 + bob(t, 0.003);
  const win = windowMat('#2c4760', '#ffdca8');
  for (const s of [1, -1]) {            // s = 1 front car (nose at +x), −1 rear car (nose at −x)
    const C0 = new THREE.Group(); C0.position.set(s * 0.225, y, 0); C0.scale.x = s; root.add(C0);
    profile(C0, 'tram', [[-0.2, 0.008], [0.165, 0.008], [0.205, 0.035], [0.2, 0.095], [0.17, 0.135], [-0.2, 0.135]], 0.14, L.body, 0.008);
    // window band (lit at night), a livery stripe and the driver's windscreen
    for (const f of [1, -1]) {
      cbox(C0, 0.33, 0.042, 0.004, win, -0.02, 0.098, f * 0.0705);
      cbox(C0, 0.38, 0.014, 0.004, L.paint, -0.005, 0.054, f * 0.0705);
      cbox(C0, 0.36, 0.006, 0.004, neonMat(L.under, 0.4), -0.01, 0.018, f * 0.0705);
    }
    const ws = cbox(C0, 0.006, 0.05, 0.12, GLASS, 0.196, 0.102, 0); ws.rotation.z = 0.5;
    cbox(C0, 0.22, 0.02, 0.08, C('#9aa3ad', 0.4, 0.4), -0.04, 0.143, 0);     // roof pod
    // lights: headlights on the front car, tail lights on the rear car's far end
    for (const f of [1, -1]) cbox(C0, 0.006, 0.012, 0.022, neonMat(s > 0 ? HEAD : TAIL, 0.7), 0.205, 0.035, f * 0.045);
    cbox(root, 0.4, 0.004, 0.152, under(L.under, t, s * 0.25), s * 0.225, y - 0.004, 0);
  }
  // the bellows between the cars
  for (let i = 0; i < 4; i++) cbox(root, 0.006, 0.11, 0.12, i % 2 ? DARK : TRIM, -0.012 + i * 0.008, y + 0.015 + 0.055, 0);
}

function maglevLook(p) { const paint = paintOf(p); return { paint: C(paint, 0.5, 0.25), shell: C('#f1f3f5', 0.35, 0.25), under: UNDER[(p.seed * 3 + 2) % UNDER.length] }; }
function drawMaglev(root, L, t, p) {
  // a length of guideway under it (can be switched off when the game draws the track itself)
  if (p.rail) {
    cbox(root, 0.98, 0.05, 0.06, C('#8e959c', 0.2, 0.7), 0, 0.025, 0);
    cbox(root, 0.98, 0.016, 0.13, C('#6c737b', 0.3, 0.6), 0, 0.058, 0);
    cbox(root, 0.98, 0.004, 0.012, neonMat(L.under, 0.45), 0, 0.068, 0);
    for (const x of [-0.45, 0, 0.45]) cbox(root, 0.04, 0.03, 0.15, C('#555c64', 0.3, 0.6), x, 0.0, 0);
  }
  const y = (p.rail ? 0.1 : 0.06) + bob(t, 0.004);
  const B = new THREE.Group(); B.position.y = y; root.add(B);
  // a long smooth capsule, a wraparound window band, a painted nose stripe and tail fins
  ball(B, 0.06, L.shell, 0, 0.035, 0, 3.1, 0.82, 1.08);
  ball(B, 0.058, windowMat('#23405a', '#cfe8ff'), 0.012, 0.045, 0, 2.6, 0.5, 1.12);
  ball(B, 0.061, L.paint, 0.0, 0.028, 0, 3.12, 0.3, 1.1);
  for (const s of [1, -1]) { const fin = cbox(B, 0.05, 0.004, 0.035, L.paint, -0.165, 0.035, s * 0.06); fin.rotation.x = s * 0.4; }
  ball(B, 0.012, neonMat(HEAD, 0.8), 0.184, 0.032, 0, 0.5, 0.8, 1.6);
  ball(B, 0.012, neonMat(TAIL, 0.7), -0.184, 0.035, 0, 0.5, 0.8, 1.8);
  // the levitation skid and its glow
  cbox(B, 0.26, 0.012, 0.05, DARK, 0, -0.015, 0);
  cbox(root, 0.3, 0.004, 0.09, under(L.under, t), 0, y - 0.024, 0);
}

function haulerLook(p) {
  const box = ['#d0662b', '#2f6fd0', '#3a9a5c', '#c9b235', '#a23a3a', '#8b8f96'][(p.seed * 5 + 1) % 6];
  return { cab: C(paintOf(p), 0.4, 0.35), box: C(box, 0.3, 0.6), rib: C(shade(box, -0.25), 0.3, 0.6), under: UNDER[(p.seed * 3) % UNDER.length] };
}
function drawHauler(root, L, t) {
  const y = 0.04 + bob(t, 0.004);
  const B = new THREE.Group(); B.position.y = y; root.add(B);
  // chassis
  cbox(B, 0.6, 0.022, 0.13, DARK, 0.0, 0.011, 0);
  // cab at the front: a stubby wedge with a wide windscreen and amber roof beacons
  const cab = new THREE.Group(); cab.position.x = 0.23; B.add(cab);
  profile(cab, 'cab', [[-0.07, 0.02], [0.06, 0.02], [0.075, 0.05], [0.055, 0.115], [0.0, 0.135], [-0.07, 0.135]], 0.15, L.cab, 0.007);
  const ws = cbox(cab, 0.006, 0.05, 0.13, GLASS, 0.066, 0.09, 0); ws.rotation.z = 0.32;
  for (const f of [1, -1]) {
    cbox(cab, 0.05, 0.03, 0.004, GLASS, 0.0, 0.1, f * 0.076);
    cbox(cab, 0.006, 0.014, 0.03, neonMat(HEAD, 0.75), 0.076, 0.04, f * 0.045);
    cbox(cab, 0.018, 0.012, 0.018, neonMat(AMBER, 0.7), -0.03, 0.142, f * 0.05);
  }
  cbox(cab, 0.004, 0.006, 0.12, neonMat(L.under, 0.5), 0.078, 0.026, 0);
  // the container: ribbed sides, door bars at the back, a corner light
  const cx = -0.07, cl = 0.4;
  cbox(B, cl, 0.13, 0.14, L.box, cx, 0.09, 0);
  for (let i = 0; i < 9; i++) for (const f of [1, -1]) cbox(B, 0.006, 0.12, 0.004, L.rib, cx - cl / 2 + 0.02 + i * (cl - 0.04) / 8, 0.09, f * 0.071);
  cbox(B, 0.004, 0.13, 0.14, L.rib, cx - cl / 2 - 0.002, 0.09, 0);
  for (const f of [1, -1]) cbox(B, 0.004, 0.12, 0.006, TRIM, cx - cl / 2 - 0.005, 0.09, f * 0.025);
  for (const f of [1, -1]) cbox(B, 0.006, 0.014, 0.02, neonMat(TAIL, 0.6), -0.3, 0.035, f * 0.055);
  cbox(B, 0.01, 0.01, 0.01, neonMat(AMBER, 0.6), cx - cl / 2, 0.158, 0.068);
  // hover pods: three pairs, each with a glowing underside that flickers
  for (const [x, k] of [[0.22, 0], [-0.04, 0.33], [-0.2, 0.66]]) for (const f of [1, -1]) {
    disc(B, 0.032, 0.024, TRIM, x, -0.008, f * 0.07);
    disc(B, 0.04, 0.004, under(L.under, t, k), x, -0.022, f * 0.07);
  }
}

addRecipes({
  'veh-car': {
    name: 'Hover-car', group: 'vehicles', size: [1, 1], dirs: 8, noStyle: true, anims: { drive: { label: 'Drive', frames: 4, fps: 8 } },
    blurb: 'Everyday traffic: a wheel-less wedge on a glowing underside, head and tail lights. Paint varies.',
    params: [paintParam], build: vehicle(carLook, drawCar),
  },
  'veh-tram': {
    name: 'Tram', group: 'vehicles', size: [1, 1], dirs: 8, noStyle: true, anims: { drive: { label: 'Drive', frames: 4, fps: 8 } },
    blurb: 'Two linked cars nearly a tile long; window bands light up warm at night.',
    params: [paintParam], build: vehicle(tramLook, drawTram),
  },
  'veh-maglev': {
    name: 'Maglev Pod', group: 'vehicles', size: [1, 1], dirs: 8, noStyle: true, anims: { drive: { label: 'Drive', frames: 4, fps: 8 } },
    blurb: 'A sleek capsule floating over its guideway. Turn the rail off when the track is drawn separately.',
    params: [paintParam, { key: 'rail', label: 'Guideway', min: 0, max: 1, step: 1, def: 1, names: ['Off', 'On'] }], build: vehicle(maglevLook, drawMaglev),
  },
  'veh-hauler': {
    name: 'Cargo Hauler', group: 'vehicles', size: [1, 1], dirs: 8, noStyle: true, anims: { drive: { label: 'Drive', frames: 4, fps: 8 } },
    blurb: 'A heavy hover truck with a ribbed container, amber roof beacons and six flickering lift pods.',
    params: [paintParam], build: vehicle(haulerLook, drawHauler),
  },
});
