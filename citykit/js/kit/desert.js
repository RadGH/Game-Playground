// Desert badlands (Overdrive Frame, "Red Mesa": a change of scenery out past the city). Red rock mesas, buttes and
// canyon walls, and the things Halden-Voss has put up out there: a forward base (hangars, container barracks, a
// radar mast, fuel bladders, a rusted water tower), a wind farm, a solar field and a pipeline with its pump stations.
// Same contract as buildings.js (ground origin at the lot centre, nothing outside ±size/2), group 'outposts' so every
// one gets the wreck stages, genre 'desert'.
//
// The look: bright daylight. Warm reds and ochres for the rock in stacked bands (the strata), pale sand pads, and the
// company's kit in sand-tan and olive with one orange stripe (the same orange as its tanks). Missions out here are
// mostly by day, but contracts can run at night, so every man-made recipe has a few lights: beacons, lit doors.
//
// Rock is built from boxes (several per band, jittered) so the wreck stages cut it like any building: a mesa takes
// enormous punishment (the map gives it very high hp) but it can, in the end, come down as a heap of red slabs.
import * as THREE from 'three';
import { addRecipes } from './buildings.js';
import { box, cyl, lotPad, bodyMat, neonMat } from './shapes.js';

const cache = new Map();
const cached = (k, make) => { if (!cache.has(k)) cache.set(k, make()); return cache.get(k); };
const f3 = n => n.toFixed(3);

const SAND = '#c99b68', SAND_D = '#b0855a', CONCRETE = '#a39b8c', TAN = '#b8a47a', OLIVE = '#6c6f48', OLIVE_D = '#4f5236';
const STEEL = '#8b9095', DARK = '#3b3e42', RUST = '#8e4a2a', WHITE = '#e9e6df', HV = '#ff7a1c';
const ROCK = ['#a0482a', '#b4583a', '#93402a', '#c06a45', '#a95232', '#8a3c25'], ROCK_PALE = '#d39a6c', ROCK_TOP = '#a9603d', SCREE = '#8f4c31', SCRUB = '#6d6a3a';
const WARM = '#ffd18a', RED = '#ff3030', AMBER = '#ffb02e', GREEN = '#7dff6a';

/** Plain coloured material. */
const M = (color, metal = 0.25, rough = 0.65) => bodyMat('chrome', 0, { color, metal, rough });
/** Rock: no shine at all. */
const stone = color => bodyMat('chrome', 0, { color, metal: 0, rough: 0.97 });
/** Looks like `day` in sunlight and glows `glow` at night (doors, windows). */
function lamp(day, glow, dayGlow = 0) {
  return cached(`dlamp:${day}:${glow}:${dayGlow}`, () => {
    const m = new THREE.MeshStandardMaterial({ color: day, emissive: glow, emissiveIntensity: 1, roughness: 0.4, metalness: 0.2 });
    m.userData.glow = true; m.userData.dayGlow = dayGlow; return m;
  });
}
function add(parent, geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
const G = (k, make) => cached('dg:' + k, make);
/** A low-poly lump centred at (x, y, z): scree, boulders, scrub. */
/** A small sphere (a light). */
const ball = (p, r, mat, x, y, z) => add(p, G(`ball${f3(r)}`, () => new THREE.SphereGeometry(r, 10, 7)), mat, x, y, z);
const lump = (p, r, mat, x, y, z, seg = 6) => add(p, G(`lump${f3(r)}:${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(3, Math.ceil(seg * 0.6)))), mat, x, y, z);
/** A round rod from a to b. */
function rod(p, a, b, r, mat, seg = 6) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length();
  const m = add(p, G(`rod${f3(r)}:${f3(L)}:${seg}`, () => new THREE.CylinderGeometry(r, r, L, seg)), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}
/** A lying cylinder along x (turned by ry), centre at (x, y, z). */
function hcyl(p, r, len, mat, x, y, z, ry = 0, seg = 16) {
  const m = add(p, G(`hc${f3(r)}:${f3(len)}:${seg}`, () => new THREE.CylinderGeometry(r, r, len, seg)), mat, x, y, z);
  m.rotation.set(0, ry, Math.PI / 2, 'YXZ'); return m;
}
const beacon = (p, x, y, z, color = RED, s = 0.03) => box(p, s, s, s, neonMat(color, 0.9), x, y, z);

/** Corrugated steel (containers, sheds): vertical ribs, a little dust toward the foot. */
function corrugated(color) {
  return cached(`dcorr:${color}`, () => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 32; const x = c.getContext('2d');
    x.fillStyle = color; x.fillRect(0, 0, 64, 32);
    for (let i = 0; i < 64; i += 4) { x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(i, 0, 1, 32); x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(i + 2, 0, 1, 32); }
    const g = x.createLinearGradient(0, 18, 0, 32); g.addColorStop(0, 'rgba(201,155,104,0)'); g.addColorStop(1, 'rgba(201,155,104,0.55)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 32);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ map: t, metalness: 0.35, roughness: 0.6 });
  });
}
/** Rust-streaked painted steel (the water tower). */
function rusty(color) {
  return cached(`drust:${color}`, () => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = color; x.fillRect(0, 0, 64, 64);
    let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) { const px = rnd() * 64, w = 1 + rnd() * 3, top = rnd() * 40; const g = x.createLinearGradient(0, top, 0, 64); g.addColorStop(0, 'rgba(120,52,22,0.85)'); g.addColorStop(1, 'rgba(120,52,22,0)'); x.fillStyle = g; x.fillRect(px, top, w, 64 - top); }
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(${90 + rnd() * 50},${40 + rnd() * 20},20,0.6)`; x.beginPath(); x.arc(rnd() * 64, rnd() * 64, rnd() * 3, 0, Math.PI * 2); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, metalness: 0.4, roughness: 0.75 });
  });
}

/** The lot under natural ground: a sand pad (a shade off the map's sand) with pebbles and a tuft of scrub or two. */
function sandPad(g, w, d, R, { scrub = 2 } = {}) {
  const y = lotPad(g, w, d, SAND);
  for (let i = 0; i < Math.round(w * d * 3); i++) {
    const s = R.range(0.015, 0.04), x = R.range(-0.46, 0.46) * w, z = R.range(-0.46, 0.46) * d;
    lump(g, s, stone(R.chance(0.5) ? SCREE : '#a86a45'), x, y + s * 0.3, z, 5).scale.y = 0.6;
  }
  for (let i = 0; i < scrub; i++) { const s = R.range(0.04, 0.07); lump(g, s, stone(SCRUB), R.range(-0.42, 0.42) * w, y + s * 0.5, R.range(-0.42, 0.42) * d, 6).scale.y = 0.7; }
  return y;
}
/** A company-built lot: a packed-earth pad with a concrete apron. */
function basePad(g, w, d) { lotPad(g, w, d, SAND_D); box(g, w * 0.9, 0.012, d * 0.9, M(CONCRETE, 0, 0.9), 0, 0.025, 0); return 0.037; }

/**
 * Stacked rock bands: from y0 up, `bands` layers, each a few jittered boxes whose footprint shrinks toward the top
 * (sides from `taper` 0 = straight walls to 1 = a cone). w/d = the footprint at the foot; returns the top y.
 */
function strata(g, R, { w, d, y0, H, bands, taper = 0.25, x = 0, z = 0, ragged = 0.08, top = true }) {
  const bh = H / bands, c0 = R.int(0, ROCK.length - 1); let y = y0;
  for (let b = 0; b < bands; b++) {
    // one main slab per band (sheer walls, a small shelf where a band is narrower), then a few weathered columns
    // standing proud of one face, each its own height, so the cliff reads as fluted rock rather than stacked boxes
    const f = 1 - taper * (b / bands), color = b % 4 === 2 ? ROCK_PALE : ROCK[(c0 + (b >> 1)) % ROCK.length], mat = stone(color);
    const last = b === bands - 1, bw = w * f * R.range(0.9, 0.97), bd = d * f * R.range(0.9, 0.97);
    box(g, bw, bh * 1.02 + (last ? R.range(0, ragged) : 0), bd, mat, x + R.range(-0.5, 0.5) * (w * f - bw), y, z + R.range(-0.5, 0.5) * (d * f - bd)).rotation.y = R.range(-0.02, 0.02);
    for (let k = R.int(1, 3); k > 0; k--) {
      const side = R.int(0, 3), along = side < 2, cw = (along ? d : w) * f * R.range(0.12, 0.3), t = R.range(-0.35, 0.35);
      const cx = along ? (side ? 1 : -1) * (w * f - 0.08) / 2 : t * w * f, cz = along ? t * d * f : (side === 2 ? 1 : -1) * (d * f - 0.08) / 2;
      box(g, along ? 0.1 : cw, bh * R.range(0.55, 1.02), along ? cw : 0.1, stone(ROCK[(c0 + b + k) % ROCK.length]), x + cx, y, z + cz);
    }
    y += bh;
  }
  if (top) {                                                          // the cap: flat, a touch paler, scrub on it
    const f = 1 - taper * ((bands - 1) / bands);
    box(g, w * f * 0.82, 0.03, d * f * 0.82, stone(ROCK_TOP), x, y, z);
    for (let i = 0; i < 3; i++) { const s = R.range(0.04, 0.07); lump(g, s, stone(SCRUB), x + R.range(-0.3, 0.3) * w * f, y + 0.03 + s * 0.4, z + R.range(-0.3, 0.3) * d * f, 6).scale.y = 0.7; }
  }
  return y;
}
/** Scree: fallen rocks round the foot of a wall, inside the lot. */
function scree(g, R, w, d, y0, n, { big = 0.09 } = {}) {
  for (let i = 0; i < n; i++) {
    const s = R.range(0.03, big), side = R.int(0, 3), t = R.range(-0.46, 0.46);
    const x = side < 2 ? (side ? 1 : -1) * (w / 2 - s - 0.03) : t * w, z = side >= 2 ? (side === 2 ? 1 : -1) * (d / 2 - s - 0.03) : t * d;
    lump(g, s, stone(R.chance(0.6) ? SCREE : ROCK[R.int(0, 5)]), x, y0 + s * 0.35, z, 5).scale.y = 0.65;
  }
}

// ---------------------------------------------------------------- rock
function buildMesa(p) {
  const g = new THREE.Group(), R = p.R, y0 = sandPad(g, 3, 3, R, { scrub: 4 });
  const H = 1.05 + Math.min(3, p.floors) * 0.22;
  // a skirt of fallen rock, then sheer banded walls to a flat table top
  strata(g, R, { w: 2.7, d: 2.7, y0, H: 0.18, bands: 1, taper: 0, top: false });
  strata(g, R, { w: 2.5, d: 2.45, y0: y0 + 0.16, H: H - 0.16, bands: 9, taper: 0.12 });
  scree(g, R, 3, 3, y0, 18, { big: 0.12 });
  return g;
}
function buildButte(p) {
  const g = new THREE.Group(), R = p.R, y0 = sandPad(g, 2, 2, R, { scrub: 2 });
  const H = 1.5 + Math.min(3, p.floors) * 0.2;
  // a wide talus cone, then a narrow tower of banded rock
  strata(g, R, { w: 1.8, d: 1.8, y0, H: 0.36, bands: 2, taper: 0.4, top: false });
  strata(g, R, { w: 1.15, d: 1.1, y0: y0 + 0.3, H: H - 0.3, bands: 11, taper: 0.1, ragged: 0.12 });
  scree(g, R, 2, 2, y0, 12);
  return g;
}
function buildRocks(p) {
  const g = new THREE.Group(), R = p.R, y0 = sandPad(g, 1, 1, R, { scrub: 1 });
  // a few big tumbled boulders (boxes turned every which way) with small ones round them
  for (let i = 0; i < 4; i++) {
    const s = R.range(0.2, 0.34), x = R.range(-0.18, 0.18), z = R.range(-0.18, 0.18);
    const m = box(g, s, s * R.range(0.7, 1.1), s * R.range(0.8, 1.1), stone(ROCK[R.int(0, 5)]), x, y0, z);
    m.rotation.set(R.range(-0.25, 0.25), R.range(0, Math.PI), R.range(-0.25, 0.25));
  }
  box(g, 0.22, 0.16, 0.2, stone(ROCK_PALE), R.range(-0.1, 0.1), y0 + 0.24, R.range(-0.1, 0.1)).rotation.y = R.range(0, 3);
  scree(g, R, 1, 1, y0, 7, { big: 0.06 });
  return g;
}
function buildCanyon(p) {
  const g = new THREE.Group(), R = p.R, y0 = sandPad(g, 4, 1, R, { scrub: 3 });
  // a long canyon wall along x: segments of banded rock, each its own height, so the top is ragged
  const n = 5;
  for (let i = 0; i < n; i++) {
    const x = -1.5 + i * 0.75, H = 0.95 + R.range(0, 0.45) + Math.min(3, p.floors) * 0.08;
    strata(g, R, { w: 0.92, d: 0.78, y0, H, bands: 7, taper: 0.22, x, z: R.range(-0.04, 0.04), top: R.chance(0.6) });
  }
  scree(g, R, 4, 1, y0, 16);
  return g;
}

// ---------------------------------------------------------------- the wind farm, the solar field, the pipeline
/** Nose cone + three tapered blades in the y-z plane, turned by `spin`, merged into one geometry (centre at the hub). */
function rotorGeo(spin) {
  const parts = [], m = new THREE.Matrix4();
  const nose = new THREE.SphereGeometry(0.042, 12, 8); nose.applyMatrix4(m.makeScale(1.4, 1, 1)); parts.push(nose);
  for (let k = 0; k < 3; k++) {
    const bl = new THREE.CylinderGeometry(0.008, 0.024, 0.44, 4);
    bl.applyMatrix4(new THREE.Matrix4().makeScale(0.45, 1, 1)); bl.applyMatrix4(new THREE.Matrix4().makeTranslation(0.01, 0.25, 0));
    bl.applyMatrix4(new THREE.Matrix4().makeRotationX(spin + k * Math.PI * 2 / 3)); parts.push(bl);
  }
  const pos = [], nor = [];
  for (const q of parts) { const n = q.index ? q.toNonIndexed() : q; pos.push(...n.attributes.position.array); nor.push(...n.attributes.normal.array); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
function buildTurbine(p) {
  const g = new THREE.Group(), R = p.R, y0 = sandPad(g, 1, 1, R, { scrub: 1 });
  const H = 2.25 + (p.seed % 3) * 0.1, white = M(WHITE, 0.2, 0.45);
  // concrete footing, a tapered white tower, the nacelle, three long blades (rotor plane across z, so they stay in the
  // lot), red tips, the aviation light on top, a little transformer box at the foot with its door lit. Everything up
  // high is round (cylinders, spheres), not boxes: the wreck stages drop those with the tower, so nothing floats
  cyl(g, 0.2, 0.05, M(CONCRETE, 0, 0.9), 0, y0, 0, { seg: 16 });
  cyl(g, 0.075, H, white, 0, y0 + 0.05, 0, { rt: 0.038, seg: 14 });
  cyl(g, 0.069, 0.025, M(HV, 0.2, 0.6), 0, y0 + 0.5, 0, { seg: 14 });
  const top = y0 + 0.05 + H;
  hcyl(g, 0.045, 0.24, white, -0.03, top + 0.023, 0, 0, 10);
  // the rotor (nose + three blades) is ONE mesh: as one piece it falls with the tower in the wreck stages
  const spin = R.range(0, Math.PI * 2 / 3);
  add(g, G(`drotor${f3(spin)}`, () => rotorGeo(spin)), white, 0.07, top + 0.023, 0);
  ball(g, 0.016, neonMat(RED, 0.9), -0.1, top + 0.075, 0);
  box(g, 0.16, 0.13, 0.12, M(TAN, 0.3, 0.6), 0.28, y0, 0.26);
  box(g, 0.012, 0.08, 0.05, lamp('#3a3020', AMBER, 0.15), 0.365, y0, 0.26);
  return g;
}
function buildSolar(p) {
  const g = new THREE.Group(), R = p.R, y0 = sandPad(g, 2, 1, R, { scrub: 1 });
  // three single-axis tracker rows: dark blue glass with a silver grid on a torque tube and posts, tilted to the sun,
  // a fine film of dust; a combiner box at one end
  const glass = cached('dsolar', () => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 32; const x = c.getContext('2d');
    x.fillStyle = '#1d3460'; x.fillRect(0, 0, 64, 32); x.strokeStyle = '#90a8c8'; x.lineWidth = 1;
    for (let i = 0; i <= 64; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 32); x.stroke(); }
    for (let j = 0; j <= 32; j += 8) { x.beginPath(); x.moveTo(0, j); x.lineTo(64, j); x.stroke(); }
    x.fillStyle = 'rgba(214,170,120,0.18)'; x.fillRect(0, 20, 64, 12);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, metalness: 0.55, roughness: 0.22 });
  });
  const frame = M('#c9ccd0', 0.6, 0.35), tilt = 0.35 + (p.seed % 3) * 0.12;
  for (const z of [-0.3, 0, 0.3]) {
    hcyl(g, 0.012, 1.7, M(STEEL, 0.6, 0.4), -0.05, y0 + 0.14, z, 0, 6);
    for (const x of [-0.75, -0.3, 0.15, 0.6]) cyl(g, 0.012, 0.13, M(STEEL), x, y0, z, { seg: 5 });
    const pg = new THREE.Group(); pg.position.set(-0.05, y0 + 0.155, z); pg.rotation.x = -tilt; g.add(pg);
    box(pg, 1.72, 0.014, 0.22, frame, 0, -0.008, 0);
    box(pg, 1.7, 0.01, 0.2, glass, 0, 0.004, 0);
  }
  box(g, 0.1, 0.16, 0.14, M(TAN, 0.3, 0.6), 0.9, y0, 0);
  box(g, 0.02, 0.02, 0.012, neonMat(GREEN, 0.6), 0.9, y0 + 0.12, 0.075);
  return g;
}
function buildPipe(p) {
  const g = new THREE.Group(), R = p.R, y0 = sandPad(g, 2, 1, R, { scrub: 1 });
  // a big crude line on H-frame supports, bolted flanges, a valve wheel, a marker post with a company stripe
  const pipe = M('#9a9c93', 0.55, 0.45), r = 0.11, y = y0 + 0.2;
  hcyl(g, r, 1.98, pipe, 0, y, 0, 0, 18);
  for (const x of [-0.95, -0.35, 0.35, 0.95]) hcyl(g, r + 0.012, 0.035, M(DARK, 0.6, 0.4), x, y, 0, 0, 18);
  for (const x of [-0.65, 0.05, 0.7]) {
    for (const s of [-1, 1]) box(g, 0.025, 0.2, 0.025, M(OLIVE_D, 0.3, 0.6), x, y0, s * (r + 0.02));
    box(g, 0.03, 0.025, r * 2 + 0.07, M(OLIVE_D, 0.3, 0.6), x, y - r - 0.025, 0);
  }
  cyl(g, 0.018, 0.08, M(DARK), 0.2, y + r - 0.01, 0, { seg: 6 });
  const wheel = add(g, G('dvalve', () => new THREE.TorusGeometry(0.05, 0.008, 6, 16)), M('#c2372a', 0.3, 0.5), 0.2, y + r + 0.075, 0); wheel.rotation.x = Math.PI / 2;
  cyl(g, 0.01, 0.3, M('#e3c23a', 0.2, 0.6), -0.85, y0, 0.36, { seg: 5 });
  box(g, 0.03, 0.06, 0.025, M(HV, 0.2, 0.6), -0.85, y0 + 0.24, 0.36);
  return g;
}
function buildPump(p) {
  const g = new THREE.Group(), R = p.R, y0 = basePad(g, 2, 2);
  // the pipeline comes in along x, through a manifold of valves into a corrugated pump house; two surge tanks, an
  // exhaust stack, a little control cabin, warning lights
  const pipe = M('#9a9c93', 0.55, 0.45), corr = corrugated(TAN);
  hcyl(g, 0.1, 0.5, pipe, -0.73, y0 + 0.18, 0.1, 0, 16);
  hcyl(g, 0.1, 0.45, pipe, 0.75, y0 + 0.18, 0.1, 0, 16);
  for (const x of [-0.5, -0.35]) { cyl(g, 0.02, 0.12, M(DARK), x, y0 + 0.28, 0.1, { seg: 6 }); const w = add(g, G('dvalve2', () => new THREE.TorusGeometry(0.04, 0.007, 6, 14)), M('#c2372a', 0.3, 0.5), x, y0 + 0.41, 0.1); w.rotation.x = Math.PI / 2; }
  box(g, 0.9, 0.5, 0.75, corr, 0.08, y0, -0.05);
  box(g, 0.96, 0.04, 0.82, M(OLIVE_D, 0.4, 0.5), 0.08, y0 + 0.5, -0.05).rotation.z = 0.05;
  box(g, 0.94, 0.03, 0.03, M(HV, 0.2, 0.55), 0.08, y0 + 0.4, 0.335);
  box(g, 0.2, 0.26, 0.012, lamp('#3a3020', WARM, 0.15), 0.3, y0, 0.33);
  for (const [x, z] of [[-0.55, -0.62], [-0.2, -0.62]]) { cyl(g, 0.13, 0.55, M('#c9c7bd', 0.4, 0.45), x, y0, z, { seg: 16 }); add(g, G('dtcap', () => new THREE.SphereGeometry(0.13, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2)), M('#c9c7bd', 0.4, 0.45), x, y0 + 0.55, z).scale.y = 0.4; beacon(g, x, y0 + 0.6, z, RED, 0.022); }
  cyl(g, 0.045, 0.95, M(DARK, 0.5, 0.5), 0.45, y0 + 0.5, -0.3, { seg: 10 });
  cyl(g, 0.05, 0.03, M('#2a2a2a', 0.3, 0.8), 0.45, y0 + 1.45, -0.3, { seg: 10 });
  box(g, 0.3, 0.22, 0.24, M(WHITE, 0.3, 0.5), -0.6, y0, 0.6);
  box(g, 0.012, 0.08, 0.18, lamp('#24384c', WARM, 0.15), -0.445, y0 + 0.1, 0.6);
  for (let k = 0; k < 4; k++) box(g, 0.14, 0.004, 0.05, M('#e3b52c', 0.2, 0.6), 0.2 + k * 0.18, y0, 0.75).rotation.y = 0.6;
  return g;
}

// ---------------------------------------------------------------- the forward base
function buildHangar(p) {
  const g = new THREE.Group(), R = p.R, y0 = basePad(g, 3, 2);
  // an arched hangar along x: the arch built from flat roof panels (so the wreck can cut it), sand-tan with olive
  // ribs, big doors on the +z face with the company's orange stripe, sandbags, a floodlight, a parked tow tractor
  const len = 2.5, r = 0.7, cz = -0.2, nP = 8, corr = corrugated(TAN);
  for (let i = 0; i < nP; i++) {
    const a0 = Math.PI * i / nP, a1 = Math.PI * (i + 1) / nP, am = (a0 + a1) / 2;
    const span = 2 * r * Math.sin(Math.PI / nP / 2) + 0.01;
    const m = box(g, len, 0.035, span, corr, 0, 0, cz);
    m.position.set(0, y0 + Math.sin(am) * r * 0.98, cz + Math.cos(am) * r * 0.98);
    m.rotation.x = am - Math.PI / 2;
  }
  for (let k = 0; k < 6; k++) {
    const x = -len / 2 + 0.05 + k * (len - 0.1) / 5;
    add(g, G(`drib${f3(r)}`, () => new THREE.TorusGeometry(r + 0.01, 0.018, 5, 18, Math.PI)), M(OLIVE_D, 0.3, 0.6), x, y0, cz).rotation.set(0, Math.PI / 2, 0);
  }
  // the end walls: the front (toward +z) is the long side here, so the doors sit under the arch's foot; the gable ends
  // (±x) get a person door and a vent
  box(g, 1.6, 0.42, 0.04, M(OLIVE, 0.35, 0.55), 0, y0, cz + r - 0.03);
  for (let k = 0; k < 4; k++) box(g, 0.012, 0.4, 0.045, M(OLIVE_D, 0.35, 0.55), -0.6 + k * 0.4, y0, cz + r - 0.02);
  box(g, 1.64, 0.05, 0.05, M(HV, 0.2, 0.55), 0, y0 + 0.42, cz + r - 0.02);
  box(g, 1.5, 0.035, 0.03, lamp('#3a3020', AMBER, 0.15), 0, y0 + 0.36, cz + r);
  for (const s of [-1, 1]) {
    box(g, 0.04, 0.4, 1.2, M(TAN, 0.3, 0.6), s * (len / 2 - 0.02), y0, cz);
    box(g, 0.012, 0.18, 0.1, lamp('#3a3020', WARM, 0.2), s * (len / 2 + 0.003), y0, cz + 0.3);
  }
  for (let i = 0; i < 9; i++) box(g, 0.13, 0.05, 0.07, M('#a8946a', 0, 0.9), -1.35 + (i % 3) * 0.13, y0 + Math.floor(i / 3) * 0.05, 0.8);
  box(g, 0.2, 0.08, 0.14, M('#d6a92a', 0.3, 0.6), 0.95, y0, 0.75);
  box(g, 0.08, 0.06, 0.1, M(DARK, 0.4, 0.4), 0.92, y0 + 0.08, 0.75);
  cyl(g, 0.012, 0.6, M(STEEL), 1.35, y0, 0.85, { seg: 5 }); box(g, 0.1, 0.035, 0.035, neonMat(WARM, 0.3), 1.35, y0 + 0.6, 0.85);
  beacon(g, 0, y0 + r + 0.02, cz, RED, 0.03);
  return g;
}
function buildBarracks(p) {
  const g = new THREE.Group(), R = p.R, y0 = basePad(g, 2, 1);
  // shipping containers made into quarters: two side by side, a third on top (storeys 2), doors and lit windows cut in,
  // air-con units, sandbags along the front, a camouflage net over the top
  const cols = [OLIVE, TAN, '#7a5a3c'], ch = 0.26, cw = 0.86, cd = 0.3;
  const one = (x, y, z, col) => {
    box(g, cw, ch, cd, corrugated(col), x, y, z);
    box(g, 0.012, ch * 0.9, cd * 0.9, M(OLIVE_D, 0.4, 0.5), x - cw / 2 - 0.002, y + 0.01, z);
    box(g, 0.1, 0.17, 0.012, M(DARK, 0.4, 0.5), x - 0.2, y + 0.01, z + cd / 2 + 0.002);
    box(g, 0.14, 0.06, 0.012, R.chance(0.75) ? lamp('#2b3540', WARM, 0.1) : M('#1c2630', 0.6, 0.3), x + 0.15, y + 0.12, z + cd / 2 + 0.002);
    box(g, 0.1, 0.08, 0.06, M('#d7d4ca', 0.3, 0.5), x + 0.32, y + 0.04, z + cd / 2 + 0.03);
  };
  one(-0.02, y0, -0.17, cols[p.seed % 3]);
  one(-0.02, y0, 0.17, cols[(p.seed + 1) % 3]);
  let top = y0 + ch;
  if (p.floors >= 2) { one(0.02, top, 0, cols[(p.seed + 2) % 3]); top += ch; }
  const net = box(g, 0.98, 0.012, 0.9, cached('dnet', () => new THREE.MeshStandardMaterial({ color: '#59603a', roughness: 1, metalness: 0, transparent: true, opacity: 0.88 })), 0, top + 0.03, 0);
  net.rotation.z = 0.06;
  for (const [x, z] of [[-0.46, -0.42], [0.46, -0.42], [-0.46, 0.42], [0.46, 0.42]]) cyl(g, 0.008, top + 0.03 - y0, M(STEEL), x, y0, z, { seg: 4 });
  for (let i = 0; i < 6; i++) box(g, 0.12, 0.05, 0.06, M('#a8946a', 0, 0.9), -0.82 + i * 0.12, y0, 0.44);
  beacon(g, 0.42, top + 0.05, 0.42, AMBER, 0.02);
  return g;
}
function buildRadar(p) {
  const g = new THREE.Group(), R = p.R, y0 = basePad(g, 1, 1);
  // a lattice tower, a platform, a wide search radar on a turntable (its sweep is frozen in the picture), red beacons,
  // a cabin at the foot with the company stripe; guy wires to the corners
  const steel = M('#9da39f', 0.55, 0.4), H = 1.35, w = 0.14;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod(g, [a * w, y0, b * w], [a * 0.07, y0 + H, b * 0.07], 0.011, steel, 4);
  for (let k = 1; k < 8; k++) { const f = k / 8, s = 2 * (w - (w - 0.07) * f); box(g, s, 0.01, s, steel, 0, y0 + H * f, 0); if (k % 2) for (const sg of [-1, 1]) rod(g, [-s / 2, y0 + H * f, sg * s / 2], [s / 2, y0 + H * (f + 1 / 8), sg * s / 2], 0.005, steel, 3); }
  box(g, 0.26, 0.025, 0.26, M(OLIVE_D, 0.4, 0.5), 0, y0 + H, 0);
  cyl(g, 0.04, 0.08, M(DARK), 0, y0 + H + 0.025, 0, { seg: 10 });
  const ant = new THREE.Group(); ant.position.set(0, y0 + H + 0.12, 0); ant.rotation.y = R.range(0, Math.PI); g.add(ant);
  box(ant, 0.84, 0.16, 0.025, M('#d9d6cc', 0.4, 0.45), 0, 0, 0.02).rotation.x = -0.25;
  for (let k = 0; k < 5; k++) box(ant, 0.84, 0.008, 0.035, M(DARK, 0.5, 0.4), 0, 0.02 + k * 0.03, 0.035).rotation.x = -0.25;
  box(ant, 0.08, 0.06, 0.08, M(OLIVE, 0.4, 0.5), 0, -0.05, -0.04);
  beacon(g, 0.1, y0 + H + 0.03, 0.1, RED, 0.03);
  beacon(g, 0, y0 + H * 0.55, 0.06, RED, 0.022);
  box(g, 0.3, 0.2, 0.22, M(TAN, 0.3, 0.6), 0.27, y0, -0.25);
  box(g, 0.31, 0.03, 0.23, M(HV, 0.2, 0.55), 0.27, y0 + 0.15, -0.25);
  box(g, 0.012, 0.1, 0.08, lamp('#3a3020', WARM, 0.2), 0.425, y0, -0.2);
  const wire = M('#8d9297', 0.6, 0.4);
  for (const [a, b] of [[-1, -1], [1, 1], [-1, 1]]) rod(g, [a * 0.46, y0, b * 0.46], [0, y0 + H * 0.6, 0], 0.003, wire, 3);
  return g;
}
function buildBladder(p) {
  const g = new THREE.Group(), R = p.R, y0 = sandPad(g, 2, 1, R, { scrub: 0 });
  // two fuel bladders (fat rubber pillows) in a bermed pit, a pump skid with hoses, a no-flames board. They burn.
  box(g, 1.9, 0.03, 0.9, M('#9a7c5a', 0, 0.95), 0, y0, 0);
  for (const s of [-1, 1]) { box(g, 1.94, 0.1, 0.08, M(SAND_D, 0, 0.95), 0, y0, s * 0.44); box(g, 0.08, 0.1, 0.8, M(SAND_D, 0, 0.95), s * 0.93, y0, 0); }
  const rub = M('#3f4230', 0.1, 0.7);
  for (const x of [-0.45, 0.4]) {
    const b = add(g, G('dblad', () => new THREE.SphereGeometry(0.3, 18, 10)), rub, x, y0 + 0.11, 0);
    b.scale.set(1.35, 0.38, 1.2);
    box(g, 0.05, 0.03, 0.05, M(DARK), x + 0.2, y0 + 0.2, 0.12);
    const seam = add(g, G('dbseam', () => new THREE.TorusGeometry(0.3, 0.006, 4, 24)), M('#2d2f24', 0.2, 0.7), x, y0 + 0.11, 0); seam.rotation.x = Math.PI / 2; seam.scale.set(1.35, 1.2, 1);
  }
  box(g, 0.16, 0.12, 0.14, M('#c43a2a', 0.4, 0.5), 0.82, y0, -0.25);
  rod(g, [0.6, y0 + 0.2, 0.12], [0.76, y0 + 0.1, -0.2], 0.012, M('#222', 0.2, 0.8), 5);
  rod(g, [-0.25, y0 + 0.2, 0.12], [0.76, y0 + 0.06, -0.3], 0.012, M('#222', 0.2, 0.8), 5);
  cyl(g, 0.01, 0.3, M(STEEL), -0.85, y0, 0.36, { seg: 4 }); box(g, 0.14, 0.09, 0.012, M('#e8e2d0', 0.1, 0.6), -0.85, y0 + 0.26, 0.36);
  box(g, 0.1, 0.02, 0.014, M('#c2372a', 0.1, 0.6), -0.85, y0 + 0.3, 0.367);
  beacon(g, 0.82, y0 + 0.14, -0.25, AMBER, 0.02);
  return g;
}
function buildWaterTower(p) {
  const g = new THREE.Group(), R = p.R, y0 = sandPad(g, 1, 1, R, { scrub: 1 });
  // an old rusted tank on four splayed legs with cross bracing, a cone roof, a ladder, a dripping pipe down the middle
  const leg = M('#6e4a32', 0.4, 0.7), tank = rusty('#8d6a4f'), H = 0.72;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod(g, [a * 0.36, y0, b * 0.36], [a * 0.2, y0 + H, b * 0.2], 0.018, leg, 5);
  for (const f of [0.3, 0.65]) { const s = 0.36 - (0.16) * f; for (const [a, b, c, d] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) rod(g, [a * s, y0 + H * f, b * s], [c * s, y0 + H * f, d * s], 0.008, leg, 4); }
  cyl(g, 0.3, 0.32, tank, 0, y0 + H, 0, { seg: 20 });
  add(g, G('dwcone', () => new THREE.ConeGeometry(0.32, 0.16, 20)), rusty('#7a5240'), 0, y0 + H + 0.4, 0);
  cyl(g, 0.31, 0.02, M(RUST, 0.4, 0.7), 0, y0 + H + 0.02, 0, { seg: 20 });
  cyl(g, 0.03, H, M(RUST, 0.4, 0.7), 0, y0, 0, { seg: 8 });
  for (let k = 0; k < 9; k++) box(g, 0.06, 0.006, 0.01, leg, 0.33, y0 + 0.1 + k * 0.1, 0.05);
  for (const s of [-1, 1]) box(g, 0.006, 0.9, 0.006, leg, 0.33, y0 + 0.08, 0.05 + s * 0.03);
  beacon(g, 0, y0 + H + 0.49, 0, RED, 0.022);
  return g;
}

const DESERT = { group: 'outposts', genre: ['desert'] };
const tall = { key: 'floors', label: 'Height', min: 1, max: 3, step: 1, def: 2 };
addRecipes({
  'desert-mesa': { ...DESERT, name: 'Red Mesa', size: [3, 3], blurb: 'A flat-topped table of banded red rock with a skirt of fallen stone. Cover that blocks a whole street\'s worth of fire; it takes a siege to bring down.', params: [tall], build: buildMesa },
  'desert-butte': { ...DESERT, name: 'Butte', size: [2, 2], blurb: 'A narrow tower of red rock on a cone of scree, taller than a mech three times over.', params: [tall], build: buildButte },
  'desert-rocks': { ...DESERT, name: 'Boulders', size: [1, 1], blurb: 'A heap of tumbled red boulders: low cover in the open.', params: [], build: buildRocks },
  'desert-canyon': { ...DESERT, name: 'Canyon Wall', size: [4, 1], blurb: 'A long ragged wall of banded rock lining a dry wash.', params: [tall], build: buildCanyon },
  'desert-turbine': { ...DESERT, name: 'Wind Turbine', size: [1, 1], blurb: 'A tall white turbine on a concrete footing, red-tipped blades and an aviation light. Hit it hard enough and it comes down.', params: [], build: buildTurbine },
  'desert-solar': { ...DESERT, name: 'Solar Rows', size: [2, 1], blurb: 'Three rows of sun-tracking panels on posts, dusted with sand.', params: [], build: buildSolar },
  'desert-pipe': { ...DESERT, name: 'Pipeline', size: [2, 1], blurb: 'A length of crude line on steel supports, with flanges, a valve wheel and a marker post.', params: [], build: buildPipe },
  'desert-pump': { ...DESERT, name: 'Pump Station', size: [2, 2], blurb: 'Where the pipeline is pushed along: a corrugated pump house, surge tanks, an exhaust stack, a control cabin.', params: [], build: buildPump },
  'desert-hangar': { ...DESERT, name: 'Forward Hangar', size: [3, 2], blurb: 'Halden-Voss field hangar: an arched corrugated shed with olive ribs, wide doors under an orange stripe, sandbags and a tow tractor.', params: [], build: buildHangar },
  'desert-barracks': { ...DESERT, name: 'Container Barracks', size: [2, 1], blurb: 'Shipping containers made into quarters, with lit windows, air-con units and a camouflage net. Two storeys stack a third container.', params: [{ key: 'floors', label: 'Storeys', min: 1, max: 2, step: 1, def: 1 }], build: buildBarracks },
  'desert-radar': { ...DESERT, name: 'Radar Mast', size: [1, 1], blurb: 'A lattice tower with a wide search radar on top and a cabin at its foot. The base\'s eyes.', params: [], build: buildRadar },
  'desert-bladder': { ...DESERT, name: 'Fuel Bladders', size: [2, 1], blurb: 'Two fat rubber fuel bladders in a bermed pit with a pump skid. Hit them hard and they go up.', params: [], build: buildBladder },
  'desert-watertower': { ...DESERT, name: 'Water Tower', size: [1, 1], blurb: 'An old rust-streaked water tank on splayed legs, left over from before the company came.', params: [], build: buildWaterTower },
});
