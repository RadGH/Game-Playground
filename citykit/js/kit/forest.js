// Pine forest (Overdrive Frame, "a change of scenery" — Pinewatch): a pine-forest ridge outside the city with a
// logging camp, a ranger's fire tower, a small hydro dam on the river and the power line that runs from it. Same
// contract as buildings.js (ground origin at the lot centre, nothing outside ±size/2), group 'wilds', genre 'forest'.
//
// Two kinds of thing:
//   - woods (pine stands, thickets, rock outcrops): they draw their OWN damage stages (`noWreck` + a Damage param),
//     because the city's wreck stages turn anything into a heap of concrete slabs. A stand of pines loses trees
//     (snapped trunks, trees lying across the lot), then burns (charred crowns, fire), then is felled (burnt logs
//     criss-cross, stumps, embers). Rock splits, scorches, then lies shattered.
//   - buildings (sawmill, log piles, skidder, cabins, fire tower, dam, pylon): the common City Kit wreck stages.
//
// Scale: 1 unit = 1 tile = 16 m; a frame is 0.75 tall, so a pine is 0.9–1.4 (15–22 m), a cabin's eaves are a
// storey up. Missions here are daytime (night 0.1–0.3), but every building has warm lit windows and lamps so the
// lights layer reads at dusk.
import * as THREE from 'three';
import { addRecipes } from './buildings.js';
import { DAMAGE_NAMES } from './wreck.js';
import { box, cyl, lotPad, bodyMat, neonMat } from './shapes.js';

const cache = new Map();
const cached = (k, make) => { if (!cache.has(k)) cache.set(k, make()); return cache.get(k); };
const f2 = n => n.toFixed(2), f3 = n => n.toFixed(3);

const BARK = '#5a3d28', BARK_DARK = '#3d2a1c', WOOD_END = '#c9a46a', PLANK = '#8a5a36', BARN = '#8c3b2a', RUST = '#8a4b2c';
const STONE = '#8d8a82', MOSS = '#5f7f3a', DIRT = '#7a6646', CONCRETE = '#a9a59c', STEEL = '#7d8690', YELLOW = '#e0b02a';
const NEEDLES = ['#3f7a3a', '#467f3c', '#36703a', '#4b8040', '#3a7440'];
const CHAR = '#2a2a24', ASH = '#3b3934';
const WARM = '#ffd18a', AMBER = '#ffb02e', RED = '#ff3030', FIRE = '#ff8a2a';

/** Plain coloured material. */
const M = (color, metal = 0.05, rough = 0.85) => bodyMat('chrome', 0, { color, metal, rough });
/** Looks like `day` in sunlight and glows `glow` at night (windows, lamps, fire). */
function lamp(day, glow, dayGlow = 0) {
  return cached(`flamp:${day}:${glow}:${dayGlow}`, () => {
    const m = new THREE.MeshStandardMaterial({ color: day, emissive: glow, emissiveIntensity: 1, roughness: 0.4, metalness: 0.1 });
    m.userData.glow = true; m.userData.dayGlow = dayGlow; return m;
  });
}
const fireMat = () => lamp('#ff7a1a', FIRE, 0.95);
const emberMat = () => lamp('#5a2a14', '#ff6a1a', 0.55);
const needleMat = c => cached(`needle:${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, metalness: 0 }));
const rockMat = c => cached(`rock:${c}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0, flatShading: true }));

function add(parent, geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
const G = (k, make) => cached('fg:' + k, make);
/** A cone standing on y (base at y). */
const cone = (p, r, h, mat, x, y, z, seg = 8) => add(p, G(`cone${f2(r)}:${f2(h)}:${seg}`, () => new THREE.ConeGeometry(r, h, seg)), mat, x, y + h / 2, z);
const ball = (p, r, mat, x, y, z, seg = 10) => add(p, G(`ball${f3(r)}:${seg}`, () => new THREE.SphereGeometry(r, seg, Math.ceil(seg * 0.7))), mat, x, y, z);
/** A round rod from a to b. */
function rod(p, a, b, r, mat, seg = 5) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length();
  const m = add(p, G(`rod${f3(r)}:${f3(L)}:${seg}`, () => new THREE.CylinderGeometry(r, r, L, seg)), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}
/** A flat bar from a to b (conveyor, chute, stair flight): w wide, t thick. */
function belt(p, a, b, w, t, mat) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], h = Math.hypot(dx, dz), L = Math.hypot(h, dy);
  const m = add(p, G(`belt${f3(L)}:${f3(t)}:${f3(w)}`, () => new THREE.BoxGeometry(L, t, w)), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  m.rotation.set(0, -Math.atan2(dz, dx), Math.atan2(dy, h), 'YXZ'); return m;
}
/** A log lying along x (turned by ry), bark round the side and pale cut wood on the ends; centre at (x, y, z). */
function log(p, r, len, x, y, z, ry = 0, { bark = BARK, end = WOOD_END } = {}) {
  const geo = G(`log${f3(r)}:${f3(len)}`, () => new THREE.CylinderGeometry(r, r, len, 9));
  const m = add(p, geo, [M(bark, 0, 0.95), M(end, 0, 0.8), M(end, 0, 0.8)], x, y, z);
  m.rotation.set(0, ry, Math.PI / 2, 'YXZ'); return m;
}
/** A gable roof along x: a solid triangular attic (w long, d deep, rise rh) with two roof plates over it. */
function gable(p, w, d, rh, y, attic, roof, x = 0, z = 0) {
  const geo = G(`gable${f3(w)}:${f3(d)}:${f3(rh)}`, () => {
    const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, rh); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(-w / 2, 0, 0); return g;
  });
  add(p, geo, attic, x, y, z);
  const a = Math.atan2(rh, d / 2), s = Math.hypot(d / 2, rh) + 0.04;
  for (const side of [-1, 1]) {
    const m = add(p, G(`roofplate${f3(w)}:${f3(s)}`, () => new THREE.BoxGeometry(w + 0.06, 0.025, s)), roof, x, y + rh / 2 + 0.014, z + side * d / 4);
    m.rotation.x = side * a;
  }
  return y + rh;
}
const beacon = (p, x, y, z, color = RED, s = 0.03) => box(p, s, s, s, neonMat(color, 0.9), x, y, z);
/** A lamp post with a warm head. */
function lampPost(p, x, z, y, h = 0.26) { cyl(p, 0.008, h, M(STEEL, 0.5, 0.4), x, y, z, { seg: 5 }); box(p, 0.05, 0.025, 0.03, neonMat(WARM, 0.25), x, y + h, z); }
/** Forest floor under a stand: needles and soil, a little inside the lot. */
function floor(g, w, d, color = '#3a4a2a') { box(g, w * 0.96, 0.012, d * 0.96, M(color, 0, 0.98), 0, 0, 0); return 0.012; }
/** A low fern: a few flattened green cones. */
function fern(g, x, z, y, s, c = '#4f8a3a') { for (let i = 0; i < 3; i++) { const m = cone(g, 0.05 * s, 0.05 * s, needleMat(c), x + (i - 1) * 0.025 * s, y, z + ((i * 7) % 3 - 1) * 0.02 * s, 6); m.scale.y = 0.7; } }

// ---------------------------------------------------------------- pines
/** One pine at (x, z): trunk, four tiers of needles, the top a sharp spire. H = height. Returns its group (base at 0). */
function pine(parent, x, z, H, R, { y = 0, burnt = false, fire = false, color = null } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const k = H / 1.2, c = color || NEEDLES[R.int(0, NEEDLES.length - 1)];
  const leaf = burnt ? needleMat(CHAR) : needleMat(c), leaf2 = burnt ? needleMat('#1f211c') : needleMat(shadeHex(c, -0.12));
  cyl(g, 0.034 * k, 0.4 * H, M(burnt ? BARK_DARK : BARK, 0, 0.95), 0, 0, 0, { rt: 0.02 * k, seg: 6 });
  const tiers = 4, base = 0.15 * H;
  for (let i = 0; i < tiers; i++) {
    const r = (0.235 - i * 0.045) * k * R.range(0.9, 1.08), hh = (0.4 - i * 0.05) * H, yy = base + i * 0.2 * H;
    const m = cone(g, Math.max(0.05, r), hh, i % 2 ? leaf2 : leaf, 0, yy, 0, 8);
    m.rotation.y = R.range(0, Math.PI);
    if (fire && (i === 0 || R.chance(0.5))) for (let f = 0; f < 3; f++) { const a = R.range(0, Math.PI * 2), rr = r * 0.6; cone(g, 0.04 * k, 0.12 * k, fireMat(), Math.cos(a) * rr, yy + 0.03, Math.sin(a) * rr, 5); }
  }
  return g;
}
function shadeHex(hex, k) { const c = new THREE.Color(hex); const t = k < 0 ? 0 : 1, a = Math.abs(k); c.r += (t - c.r) * a; c.g += (t - c.g) * a; c.b += (t - c.b) * a; return '#' + c.getHexString(); }

/** A pine lying on the ground: its base at (bx, bz), falling toward angle a, scaled down so the whole tree (crown
 *  included) stays inside the lot (half sizes hw, hd). burnt = a bare burnt log (stage 3). */
function felled(parent, bx, bz, H, a, R, hw, hd, { burnt = false, fire = false } = {}) {
  const dx = Math.cos(a), dz = Math.sin(a), margin = 0.06 + (burnt ? 0.04 : 0.24 * H / 1.2);
  let L = Infinity;
  if (Math.abs(dx) > 1e-6) L = Math.min(L, ((dx > 0 ? hw : -hw) - bx - Math.sign(dx) * margin) / dx);
  if (Math.abs(dz) > 1e-6) L = Math.min(L, ((dz > 0 ? hd : -hd) - bz - Math.sign(dz) * margin) / dz);
  const s = Math.max(0.25, Math.min(1, L / H));
  cyl(parent, 0.036 * s * H / 1.2 + 0.006, 0.05, M(burnt ? BARK_DARK : BARK), bx, 0, bz, { seg: 6 });       // the stump
  ball(parent, 0.012, M(WOOD_END), bx, 0.052, bz, 5).scale.y = 0.3;
  if (burnt) {   // a burnt log, a couple of stubs of branches
    const len = H * s * 0.8, r = 0.032 * s * H / 1.2 + 0.006;
    log(parent, r, len, bx + dx * (len / 2 + 0.03), r, bz + dz * (len / 2 + 0.03), -a, { bark: CHAR, end: '#4a3020' });
    for (let i = 0; i < 2; i++) { const t = 0.4 + i * 0.25; rod(parent, [bx + dx * len * t, r, bz + dz * len * t], [bx + dx * len * t - dz * 0.05, r + 0.05, bz + dz * len * t + dx * 0.05], 0.006, M(CHAR), 4); }
    if (R.chance(0.6)) box(parent, 0.03, 0.012, 0.03, emberMat(), bx + dx * len * 0.3, r * 1.4, bz + dz * len * 0.3);
    return;
  }
  const g = pine(parent, 0, 0, H, R, { fire, burnt: fire && R.chance(0.5) });
  g.position.set(bx + dx * 0.02, 0.035 * s, bz + dz * 0.02);
  const tilt = R.range(1.42, 1.52), dir = new THREE.Vector3(dx * Math.sin(tilt), Math.cos(tilt), dz * Math.sin(tilt)).normalize();
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.scale.setScalar(s);
}

/** Tree spots for a lot: trees spread over it (not too close), sized to fit. */
function spots(R, w, d, n) {
  const out = [], hw = w / 2, hd = d / 2;
  for (let tries = 0; out.length < n && tries < 80; tries++) {
    const H = R.range(0.9, 1.4), r = 0.235 * H / 1.2, x = R.range(-hw + r + 0.02, hw - r - 0.02), z = R.range(-hd + r + 0.02, hd - r - 0.02);
    if (out.some(o => Math.hypot(o.x - x, o.z - z) < (o.r + r) * 0.78)) continue;
    out.push({ x, z, H, r });
  }
  return out;
}

/** A stand of pines on a w×d lot, at a damage stage (0 whole, 1 damaged, 2 burning, 3 felled). */
function stand(p, w, d, n) {
  const g = new THREE.Group(), R = p.R, st = Math.round(p.damage || 0), hw = w / 2 - 0.02, hd = d / 2 - 0.02;
  // no floor of its own while it stands: the game's ground draws the needle floor, so neighbouring stands join up
  // without a seam (a pad per lot showed the tile grid); burnt ground from stage 2
  const y0 = st >= 2 ? floor(g, w, d, ASH) : 0;
  const trees = spots(R, w, d, n).sort((a, b) => b.H - a.H);
  // undergrowth: ferns and a few stones between the trunks (burnt away from stage 2)
  if (st < 2) for (let i = 0; i < Math.round(w * d * 4); i++) fern(g, R.range(-hw + 0.08, hw - 0.08), R.range(-hd + 0.08, hd - 0.08), y0, R.range(0.7, 1.3), R.chance(0.5) ? '#4f8a3a' : '#5c9440');
  for (let i = 0; i < Math.round(w * d * 1.5); i++) ball(g, R.range(0.02, 0.045), rockMat(STONE), R.range(-hw + 0.06, hw - 0.06), y0, R.range(-hd + 0.06, hd - 0.06), 6).scale.y = 0.55;
  // which trees are down at this stage
  const downShare = [0, 0.34, 0.5, 1][st];
  trees.forEach((t, i) => {
    const down = st === 3 || (i % 3 === 1 && st >= 1) || (st === 2 && i % 2 === 0 && i > 0);
    if (!down || downShare === 0) { pine(g, t.x, t.z, t.H, R, { y: y0, burnt: st === 2 && R.chance(0.6), fire: st === 2 && R.chance(0.55) }); return; }
    // fall away from the camera's back corner most of the time (it reads better lying across the lot)
    const a = R.chance(0.7) ? R.range(-0.3, 1.9) : R.range(0, Math.PI * 2);
    felled(g, t.x - Math.cos(a) * t.r * 0.6, t.z - Math.sin(a) * t.r * 0.6, t.H, a, R, hw, hd, { burnt: st === 3, fire: st === 2 });
  });
  // scorch, embers
  if (st >= 1) for (let i = 0; i < (st === 1 ? 2 : 5); i++) { const m = cyl(g, R.range(0.08, 0.2), 0.004, M('#1f1c18', 0, 1), R.range(-hw + 0.2, hw - 0.2), y0, R.range(-hd + 0.2, hd - 0.2), { seg: 10 }); m.scale.z = R.range(0.6, 1); }
  if (st >= 2) for (let i = 0; i < Math.round(w * d * (st === 3 ? 4 : 2)); i++) box(g, 0.025, 0.01, 0.025, emberMat(), R.range(-hw + 0.05, hw - 0.05), y0, R.range(-hd + 0.05, hd - 0.05));
  if (st === 2) for (let i = 0; i < Math.round(w * d * 2); i++) cone(g, 0.035, R.range(0.08, 0.16), fireMat(), R.range(-hw + 0.08, hw - 0.08), y0, R.range(-hd + 0.08, hd - 0.08), 5);
  g.userData.damage = st;
  return g;
}
const buildPine = p => stand(p, 1, 1, p.R.int(1, 2));
const buildPines = p => stand(p, 2, 2, p.R.int(5, 7));
function buildThicket(p) {
  const g = stand(p, 2, 1, p.R.int(3, 4)), R = p.R, st = Math.round(p.damage || 0);
  // an old windfall log along the front edge, mossy (charred once the stand burns)
  if (st < 3) { log(g, 0.035, 0.7, R.range(-0.4, 0.4), 0.047, 0.36, R.range(-0.2, 0.2), st >= 2 ? { bark: CHAR, end: '#4a3020' } : { bark: '#5d4a30' }); }
  return g;
}

// ---------------------------------------------------------------- rocks
/** A boulder: a jittered dodecahedron, flattened, with moss on top. Its own seeded geometry. */
function boulder(g, x, z, r, squash, R, { burnt = false, moss = true, y = 0 } = {}) {
  const geo = new THREE.DodecahedronGeometry(r, 0), pos = geo.attributes.position, seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    if (!seen.has(key)) seen.set(key, 1 + R.range(-0.18, 0.18));
    const k = seen.get(key); pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const m = add(g, geo, rockMat(burnt ? '#57534d' : R.chance(0.5) ? STONE : '#7f7c74'), x, y + r * squash * 0.55, z);
  m.scale.y = squash; m.rotation.y = R.range(0, Math.PI);
  if (moss && !burnt) { const c = add(g, G(`moss${f3(r)}`, () => new THREE.SphereGeometry(r * 0.72, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2)), rockMat(MOSS), x + R.range(-0.2, 0.2) * r, y + r * squash * 0.98, z + R.range(-0.2, 0.2) * r); c.scale.y = 0.35; }
  return m;
}
function outcrop(p, w, d) {
  const g = new THREE.Group(), R = p.R, st = Math.round(p.damage || 0), hw = w / 2, hd = d / 2;
  const y0 = st >= 2 ? floor(g, w, d, ASH) : 0;
  const big = w * d >= 4, n = big ? R.int(3, 4) : R.int(1, 2);
  const rocks = [];
  for (let i = 0; i < n; i++) {
    const r = (big ? R.range(0.32, 0.46) : R.range(0.22, 0.3)) * (i ? 0.75 : 1);
    const x = i ? R.range(-hw + r + 0.04, hw - r - 0.04) : R.range(-0.1, 0.1) * w, z = i ? R.range(-hd + r + 0.04, hd - r - 0.04) : R.range(-0.1, 0.1) * d;
    rocks.push({ x: Math.max(-hw + r + 0.04, Math.min(hw - r - 0.04, x)), z: Math.max(-hd + r + 0.04, Math.min(hd - r - 0.04, z)), r });
  }
  if (st === 3) {   // shattered: a low field of broken chunks
    for (let i = 0; i < Math.round(w * d * 9); i++) boulder(g, R.range(-hw + 0.08, hw - 0.08), R.range(-hd + 0.08, hd - 0.08), R.range(0.04, 0.1), 0.55, R, { burnt: R.chance(0.5), moss: false, y: y0 });
    for (let i = 0; i < 3; i++) box(g, 0.025, 0.01, 0.025, emberMat(), R.range(-hw + 0.1, hw - 0.1), y0, R.range(-hd + 0.1, hd - 0.1));
  } else {
    rocks.forEach((q, i) => {
      if (st === 2 && i === 0) {   // split in two halves leaning apart
        for (const s of [-1, 1]) { const m = boulder(g, q.x + s * q.r * 0.32, q.z - s * q.r * 0.1, q.r * 0.72, 0.6, R, { burnt: true, moss: false, y: y0 }); m.rotation.z = s * 0.25; }
        return;
      }
      boulder(g, q.x, q.z, q.r, big ? 0.62 : 0.7, R, { burnt: st === 2, y: y0 });
      if (st >= 1 && i === 0) for (let c = 0; c < 3; c++) { const m = box(g, 0.012, 0.004, q.r * 0.9, M('#1a1916', 0, 1), q.x + (c - 1) * q.r * 0.25, y0 + q.r * 1.1 * (big ? 0.62 : 0.7), q.z); m.rotation.y = R.range(-0.6, 0.6); }
    });
    if (st >= 1) for (let i = 0; i < 6; i++) boulder(g, R.range(-hw + 0.08, hw - 0.08), R.range(-hd + 0.08, hd - 0.08), R.range(0.03, 0.07), 0.6, R, { burnt: st === 2, moss: false, y: y0 });
    // a lone small pine growing out of the big crag
    if (big && st === 0 && R.chance(0.7)) { const q = rocks[rocks.length - 1]; pine(g, Math.max(-hw + 0.2, Math.min(hw - 0.2, q.x)), Math.max(-hd + 0.2, Math.min(hd - 0.2, q.z)), R.range(0.55, 0.75), R, { y: y0 + q.r * 0.3 }); }
    if (st === 0) for (let i = 0; i < Math.round(w * d * 2); i++) fern(g, R.range(-hw + 0.08, hw - 0.08), R.range(-hd + 0.08, hd - 0.08), y0, R.range(0.6, 1));
  }
  g.userData.damage = st;
  return g;
}
const buildRock = p => outcrop(p, 1, 1);
const buildCrag = p => outcrop(p, 2, 2);

// ---------------------------------------------------------------- buildings
/** Horizontal log courses (cabin walls), as a texture. */
function logWall() {
  return cached('flogwall', () => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) {
      const gr = x.createLinearGradient(0, i * 8, 0, i * 8 + 8);
      gr.addColorStop(0, '#9a6a40'); gr.addColorStop(0.5, '#7d5230'); gr.addColorStop(1, '#4a2f1a');
      x.fillStyle = gr; x.fillRect(0, i * 8, 64, 8);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, metalness: 0 });
  });
}
/** Vertical boards (sawmill walls), as a texture tinted `color`. */
function boards(color) {
  return cached(`fboards:${color}`, () => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 32; const x = c.getContext('2d');
    x.fillStyle = color; x.fillRect(0, 0, 64, 32);
    for (let i = 0; i < 64; i += 6) { x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(i, 0, 1, 32); x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(i + 1, 0, 2, 32); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.88, metalness: 0 });
  });
}
const windowLit = () => lamp('#2b3a46', WARM, 0.12);

function buildSawmill(p) {
  const g = new THREE.Group(), R = p.R, y0 = lotPad(g, 3, 2, DIRT);
  // the mill shed: plank walls, a rust gable roof along x, a row of lit windows, a big lit door on the near side
  const sx = -0.35, sz = -0.35, W = 1.8, D = 0.82, H = 0.32;
  box(g, W, H, D, boards(BARN), sx, y0, sz);
  for (let i = 0; i < 6; i++) box(g, 0.1, 0.06, 0.012, windowLit(), sx - W / 2 + 0.2 + i * 0.28, y0 + 0.19, sz + D / 2 + 0.003);
  box(g, 0.3, 0.22, 0.014, lamp('#3a2a1a', AMBER, 0.25), sx + 0.45, y0, sz + D / 2 + 0.004);
  gable(g, W, D, 0.2, y0 + H, boards(BARN), M(RUST, 0.4, 0.6), sx, sz);
  cyl(g, 0.045, 0.42, M('#3b3b3b', 0.5, 0.5), sx - 0.5, y0 + H + 0.1, sz - 0.1, { seg: 8 });           // stack
  // the head rig under a lean-to on the near side: a log on the carriage running into a big circular saw
  const lz = 0.48;
  for (const x of [-1.15, -0.35, 0.45]) cyl(g, 0.012, 0.3, M(PLANK), x, y0, lz + 0.22, { seg: 5 });
  const lean = box(g, 1.7, 0.02, 0.36, M(RUST, 0.4, 0.6), -0.35, y0 + 0.32, lz + 0.05); lean.rotation.x = 0.18;
  box(g, 1.4, 0.04, 0.12, M(STEEL, 0.5, 0.5), -0.45, y0 + 0.04, lz);                                      // carriage rail
  log(g, 0.07, 0.9, -0.7, y0 + 0.15, lz);
  const saw = cyl(g, 0.12, 0.012, M('#c8cdd2', 0.8, 0.25), 0.05, y0 + 0.1, lz, { seg: 24 }); saw.rotation.x = Math.PI / 2; saw.position.y = y0 + 0.15;
  box(g, 0.05, 0.03, 0.03, neonMat(WARM, 0.3), -0.35, y0 + 0.29, lz + 0.12);
  // the burner at the far end: a rust-red wigwam with a mesh cap and a glow at its door, a sawdust heap beside it
  const bx = 1.05, bz = -0.35;
  cyl(g, 0.3, 0.06, M(CONCRETE), bx, y0, bz, { seg: 16 });
  cone(g, 0.28, 0.62, M('#7a3624', 0.4, 0.7), bx, y0 + 0.06, bz, 16);
  cyl(g, 0.06, 0.06, M('#2a2a2a', 0.6, 0.5), bx, y0 + 0.62, bz, { seg: 10 });
  box(g, 0.1, 0.09, 0.02, lamp('#5a2a14', FIRE, 0.7), bx + 0.06, y0 + 0.07, bz + 0.27);
  belt(g, [sx + W / 2, y0 + 0.24, -0.35], [bx - 0.2, y0 + 0.42, bz], 0.08, 0.02, M('#4a4a48', 0.4, 0.6));
  const heap = cone(g, 0.28, 0.2, M('#c8a46a', 0, 1), 1.12, y0, 0.55, 14); heap.scale.z = 0.8;
  // stacks of sawn boards on stickers, a floodlight on a pole
  for (const [x, z] of [[-1.25, 0.82], [-0.7, 0.82]]) for (let k = 0; k < 3; k++) box(g, 0.42, 0.045, 0.2, M(k % 2 ? '#d1b07a' : '#c49f68', 0, 0.85), x, y0 + k * 0.05, z);
  lampPost(g, 0.5, 0.85, y0, 0.36);
  return g;
}

function buildLogs(p) {
  const g = new THREE.Group(), R = p.R, y0 = lotPad(g, 2, 1, DIRT);
  // two decks of logs on skids, held by stakes; the cut ends face the camera
  for (const x of [-0.47, 0.47]) {
    const rows = R.int(3, 4), r = R.range(0.062, 0.075);
    for (const z of [-0.3, 0.3]) box(g, 0.86, 0.025, 0.04, M('#5d4a30'), x, y0, z);
    for (let row = 0; row < rows; row++) {
      const n = rows - row + 1;
      for (let i = 0; i < n; i++) log(g, r * R.range(0.92, 1.06), 0.8, x, y0 + 0.025 + r + row * r * 1.72, (i - (n - 1) / 2) * r * 2.02, Math.PI / 2 + R.range(-0.03, 0.03));
    }
    for (const s of [-1, 1]) cyl(g, 0.014, 0.08 + rows * r * 1.72, M(PLANK), x + s * 0.36, y0, (rows + 1) / 2 * r * 2.04 + 0.01, { seg: 5 });
  }
  return g;
}

function buildSkidder(p) {
  const g = new THREE.Group(), R = p.R, y0 = lotPad(g, 1, 1, DIRT);
  const body = M(YELLOW, 0.3, 0.55), dark = M('#2b2b2b', 0.3, 0.7), tyre = M('#1d1d1d', 0.1, 0.9);
  // an articulated log skidder: four huge tyres, front engine + cab, a blade, a grapple arch over the back with logs
  for (const x of [-0.2, 0.2]) for (const z of [-0.15, 0.15]) { const t = cyl(g, 0.095, 0.075, tyre, x, 0, z, { seg: 14 }); t.rotation.x = Math.PI / 2; t.position.y = y0 + 0.095; }
  box(g, 0.3, 0.1, 0.2, body, 0.2, y0 + 0.1, 0);
  box(g, 0.28, 0.08, 0.18, body, -0.18, y0 + 0.1, 0);
  box(g, 0.08, 0.06, 0.08, dark, 0, y0 + 0.12, 0);                                   // the articulation joint
  box(g, 0.16, 0.06, 0.18, body, 0.27, y0 + 0.2, 0);                                // hood
  box(g, 0.14, 0.15, 0.18, M('#d9a826', 0.3, 0.55), 0.08, y0 + 0.2, 0);             // cab
  box(g, 0.012, 0.09, 0.14, lamp('#2b3a46', WARM, 0.08), 0.152, y0 + 0.25, 0);
  box(g, 0.1, 0.09, 0.012, lamp('#2b3a46', WARM, 0.08), 0.08, y0 + 0.25, 0.092);
  box(g, 0.16, 0.012, 0.2, dark, 0.08, y0 + 0.35, 0);
  beacon(g, 0.08, y0 + 0.36, 0.05, AMBER, 0.025);
  box(g, 0.035, 0.08, 0.36, M('#9a9a92', 0.6, 0.4), 0.41, y0 + 0.03, 0);           // blade
  for (const z of [-0.06, 0.06]) box(g, 0.012, 0.02, 0.025, neonMat(WARM, 0.5), 0.355, y0 + 0.22, z);
  cyl(g, 0.012, 0.14, dark, 0.3, y0 + 0.26, -0.06, { seg: 6 });                    // exhaust
  for (const z of [-0.09, 0.09]) rod(g, [-0.12, y0 + 0.18, z], [-0.3, y0 + 0.38, z], 0.014, body);
  rod(g, [-0.3, y0 + 0.38, -0.09], [-0.3, y0 + 0.38, 0.09], 0.014, body);
  for (const z of [-0.05, 0.05]) rod(g, [-0.3, y0 + 0.38, z], [-0.36, y0 + 0.2, z * 1.6], 0.008, dark, 4);
  for (const z of [-0.05, 0.05]) log(g, 0.04, 0.5, -0.2, y0 + 0.2 + (z > 0 ? 0.02 : 0), z * 1.3, 0.04);
  return g;
}

function buildCabin(p) {
  const g = new THREE.Group(), R = p.R, y0 = lotPad(g, 1, 1, '#6a5a40');
  const roofC = ['#3f5a3a', RUST, '#4a4e55'][p.seed % 3];
  // stone footing, log walls, a gable roof, a stone chimney, a porch with a lamp, lit windows, a woodpile
  box(g, 0.6, 0.04, 0.46, M(STONE, 0, 0.95), -0.02, y0, -0.06);
  box(g, 0.56, 0.22, 0.42, logWall(), -0.02, y0 + 0.04, -0.06);
  gable(g, 0.56, 0.42, 0.16, y0 + 0.26, logWall(), M(roofC, 0.2, 0.7), -0.02, -0.06);
  box(g, 0.08, 0.36, 0.08, M('#7d7a72', 0, 0.95), -0.24, y0 + 0.08, -0.2);
  for (const x of [-0.17, 0.13]) box(g, 0.09, 0.08, 0.012, windowLit(), x, y0 + 0.12, 0.155);
  box(g, 0.012, 0.08, 0.09, windowLit(), 0.265, y0 + 0.12, -0.08);
  box(g, 0.08, 0.15, 0.012, M('#4a2f1a'), -0.02, y0 + 0.04, 0.155);
  box(g, 0.56, 0.025, 0.16, M(PLANK), -0.02, y0 + 0.02, 0.24);                      // porch
  for (const x of [-0.27, 0.23]) cyl(g, 0.01, 0.2, M(PLANK), x, y0 + 0.04, 0.3, { seg: 5 });
  const pr = box(g, 0.6, 0.018, 0.18, M(roofC, 0.2, 0.7), -0.02, y0 + 0.24, 0.25); pr.rotation.x = 0.2;
  box(g, 0.025, 0.025, 0.025, neonMat(WARM, 0.35), 0.1, y0 + 0.2, 0.17);
  for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) log(g, 0.022, 0.16, 0.38, y0 + 0.022 + row * 0.038, -0.3 + (i + row / 2) * 0.046, Math.PI / 2);
  return g;
}

function buildTower(p) {
  const g = new THREE.Group(), R = p.R, y0 = lotPad(g, 1, 1, '#6a5a40');
  const steel = M('#8e969c', 0.5, 0.45), H = 1.22;
  // four legs leaning in, X-braced; zig-zag stair flights inside; the lookout cab with windows all round and a hip roof
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { box(g, 0.07, 0.04, 0.07, M(CONCRETE), a * 0.3, y0, b * 0.3); rod(g, [a * 0.3, y0 + 0.04, b * 0.3], [a * 0.13, y0 + H, b * 0.13], 0.012, steel); }
  const at = f => 0.3 - (0.3 - 0.13) * f;
  for (let k = 1; k <= 5; k++) {
    const f0 = (k - 1) / 5, f1 = k / 5, y = y0 + 0.04 + (H - 0.04) * f1, yb = y0 + 0.04 + (H - 0.04) * f0, s = at(f1), sb = at(f0);
    for (const [a, b, c, d] of [[-1, 1, 1, 1], [1, -1, 1, 1], [-1, -1, 1, -1], [-1, -1, -1, 1]]) rod(g, [a * s, y, b * s], [c * s, y, d * s], 0.006, steel, 4);
    rod(g, [-sb, yb, sb], [sb, y, s], 0.004, steel, 3); rod(g, [sb, yb, -sb], [s, y, sb > 0 ? s : -s], 0.004, steel, 3);
    belt(g, [k % 2 ? -0.08 : 0.08, yb + 0.02, 0], [k % 2 ? 0.08 : -0.08, y - 0.02, 0], 0.06, 0.012, M(PLANK));
  }
  const cy = y0 + H;
  box(g, 0.42, 0.025, 0.42, M(PLANK), 0, cy, 0);
  for (const s of [-1, 1]) { box(g, 0.42, 0.04, 0.008, steel, 0, cy + 0.05, s * 0.205); box(g, 0.008, 0.04, 0.42, steel, s * 0.205, cy + 0.05, 0); }
  box(g, 0.32, 0.07, 0.32, boards('#7a5a3a'), 0, cy + 0.025, 0);
  box(g, 0.326, 0.1, 0.326, lamp('#4a6878', WARM, 0.1), 0, cy + 0.095, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(g, 0.02, 0.1, 0.02, M('#5a3d28'), x * 0.155, cy + 0.095, z * 0.155);
  const roof = cone(g, 0.29, 0.14, M('#3f5a3a', 0.2, 0.7), 0, cy + 0.195, 0, 4); roof.rotation.y = Math.PI / 4;
  rod(g, [0.05, cy + 0.3, 0.05], [0.05, cy + 0.48, 0.05], 0.004, steel, 3);
  beacon(g, 0.05, cy + 0.48, 0.05, RED, 0.03);
  // a little shed at the foot
  box(g, 0.2, 0.12, 0.14, boards('#7a5a3a'), 0.3, y0, -0.3);
  box(g, 0.025, 0.025, 0.012, neonMat(WARM, 0.35), 0.3, y0 + 0.09, -0.225);
  return g;
}

function buildDam(p) {
  const g = new THREE.Group(), R = p.R;
  const conc = M(CONCRETE, 0.05, 0.9), water = cached('fwater', () => new THREE.MeshStandardMaterial({ color: '#2c6f88', roughness: 0.12, metalness: 0.25 }));
  const foam = cached('ffoam', () => new THREE.MeshStandardMaterial({ color: '#dff0f2', roughness: 0.5, metalness: 0, emissive: '#bfe8ff', emissiveIntensity: 0.08 }));
  // the reservoir held behind the wall (upstream, −z) and the tail water below it (downstream, +z)
  box(g, 3.9, 0.36, 0.56, water, 0, 0, -0.7);
  box(g, 3.9, 0.012, 0.5, M('#2e6476', 0.2, 0.2), 0, 0, 0.72);
  // the wall: a concrete gravity dam with a crest road, wing walls into the banks
  box(g, 3.92, 0.48, 0.5, conc, 0, 0, -0.18);
  box(g, 3.92, 0.04, 0.6, M('#bdb9b0', 0.05, 0.9), 0, 0.48, -0.18);
  for (const z of [-0.47, 0.11]) box(g, 3.9, 0.03, 0.012, M(STEEL, 0.5, 0.5), 0, 0.53, z);          // crest railings
  // three spillway gates in the middle, water pouring down the chutes into foam
  for (let i = -1; i <= 1; i++) {
    const x = i * 0.42;
    box(g, 0.08, 0.2, 0.36, conc, x - 0.2, 0.48, -0.2); if (i === 1) box(g, 0.08, 0.2, 0.36, conc, x + 0.22, 0.48, -0.2);
    box(g, 0.3, 0.14, 0.04, M('#4a5560', 0.6, 0.4), x, 0.56, -0.3);
    belt(g, [x, 0.42, 0.08], [x, 0.04, 0.62], 0.32, 0.03, foam);
  }
  box(g, 1.3, 0.04, 0.5, foam, 0, 0.012, 0.72);
  for (let i = 0; i < 9; i++) ball(g, R.range(0.04, 0.08), foam, R.range(-0.6, 0.6), 0.03, R.range(0.55, 0.92), 8).scale.y = 0.4;
  box(g, 1.3, 0.05, 0.2, conc, 0, 0.68, -0.2);                                    // gate hoist beam
  for (let i = -1; i <= 1; i++) box(g, 0.1, 0.07, 0.12, M(YELLOW, 0.3, 0.55), i * 0.42, 0.73, -0.2);
  // the powerhouse at the foot of the east wing: lit windows, a transformer yard with insulators
  const px = 1.35;
  box(g, 0.9, 0.32, 0.55, M('#b7b2a6', 0.05, 0.9), px, 0, 0.42);
  box(g, 0.94, 0.03, 0.6, M('#5a5f66', 0.4, 0.5), px, 0.32, 0.42);
  for (let i = 0; i < 4; i++) box(g, 0.12, 0.12, 0.012, windowLit(), px - 0.33 + i * 0.22, 0.14, 0.7);
  box(g, 0.16, 0.12, 0.012, lamp('#3a2a1a', AMBER, 0.25), px - 0.1, 0, 0.7).position.x = px + 0.3;
  for (const x of [-1.75, -1.4]) { box(g, 0.16, 0.14, 0.14, M('#5d6670', 0.5, 0.5), x, 0, 0.55); for (const dz of [-0.04, 0.04]) cyl(g, 0.012, 0.1, lamp('#6a5a4a', '#ffd18a', 0), x, 0.14, 0.55 + dz, { seg: 6 }); }
  // crest lamps, red warning lights on the ends
  for (const x of [-1.6, -0.9, 0.9, 1.6]) lampPost(g, x, -0.43, 0.52, 0.2);
  for (const x of [-1.9, 1.9]) beacon(g, x, 0.52, -0.18, RED, 0.035);
  return g;
}

function buildPylon(p) {
  const g = new THREE.Group(), R = p.R, y0 = 0.012;
  box(g, 0.9, 0.012, 0.9, M('#4a5634', 0, 1), 0, 0, 0);
  const steel = M('#9aa2a8', 0.55, 0.45), H = 1.32, s0 = 0.24, s1 = 0.06;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { box(g, 0.08, 0.05, 0.08, M(CONCRETE), a * s0, y0, b * s0); rod(g, [a * s0, y0 + 0.05, b * s0], [a * s1, y0 + H, b * s1], 0.011, steel, 4); }
  for (let k = 1; k <= 6; k++) {
    const f = k / 6, s = s0 - (s0 - s1) * f, y = y0 + 0.05 + (H - 0.05) * f, fb = (k - 1) / 6, sb = s0 - (s0 - s1) * fb, yb = y0 + 0.05 + (H - 0.05) * fb;
    for (const [a, b, c, d] of [[-1, 1, 1, 1], [1, -1, 1, 1], [-1, -1, 1, -1], [-1, -1, -1, 1]]) rod(g, [a * s, y, b * s], [c * s, y, d * s], 0.005, steel, 3);
    rod(g, [-sb, yb, sb], [s, y, s], 0.004, steel, 3); rod(g, [sb, yb, -sb], [s, y, s], 0.004, steel, 3);
  }
  // two cross-arms with hanging insulators and stubs of line, a red light on the peak
  for (const [y, len] of [[y0 + H * 0.8, 0.82], [y0 + H, 0.62]]) {
    box(g, 0.05, 0.035, len, steel, 0, y - 0.02, 0);
    for (const z of [-len / 2 + 0.04, len / 2 - 0.04]) { cyl(g, 0.016, 0.07, M('#3a5a6a', 0.3, 0.2), 0, y - 0.09, z, { seg: 8 }); rod(g, [-0.42, y - 0.12, z], [0.42, y - 0.1, z], 0.004, M('#30343a', 0.4, 0.5), 3); }
  }
  beacon(g, 0, y0 + H + 0.03, 0, RED, 0.03);
  return g;
}

const DAMAGE = { key: 'damage', label: 'Damage', min: 0, max: 3, step: 1, def: 0, names: DAMAGE_NAMES };
const WOODS = { group: 'wilds', genre: ['forest'], noWreck: true, params: [DAMAGE] };
const BUILT = { group: 'wilds', genre: ['forest'], params: [] };
addRecipes({
  'forest-pine': { ...WOODS, name: 'Lone Pine', size: [1, 1], blurb: 'A tall pine (or two) on a patch of needles and ferns. Damaged snaps a trunk, burning sets the crowns alight, rubble leaves burnt logs and stumps.', build: buildPine },
  'forest-pines': { ...WOODS, name: 'Pine Stand', size: [2, 2], blurb: 'Five to seven pines of mixed heights over ferns and stones: the woods are made of these. Hit it and the trees come down across the lot.', build: buildPines },
  'forest-thicket': { ...WOODS, name: 'Pine Thicket', size: [2, 1], blurb: 'A strip of young pines with an old mossy windfall log along its edge.', build: buildThicket },
  'forest-rock': { ...WOODS, name: 'Boulder', size: [1, 1], blurb: 'A mossy granite boulder, low enough to jump onto. It cracks, scorches, splits and finally lies shattered.', build: buildRock },
  'forest-crag': { ...WOODS, name: 'Rock Outcrop', size: [2, 2], blurb: 'A cluster of big granite boulders, sometimes with a stunted pine growing out of it. Tough cover.', build: buildCrag },
  'forest-sawmill': { ...BUILT, name: 'Sawmill', size: [3, 2], blurb: 'The camp mill: a plank shed with a rust roof, a big circular saw under a lean-to, a wigwam burner glowing at its door and a sawdust heap.', build: buildSawmill },
  'forest-logs': { ...BUILT, name: 'Log Decks', size: [2, 1], blurb: 'Two decks of cut logs on skids, held by stakes, the pale cut ends facing the yard.', build: buildLogs },
  'forest-skidder': { ...BUILT, name: 'Log Skidder', size: [1, 1], blurb: 'A yellow articulated skidder with huge tyres, a blade and a grapple arch dragging two logs. Its fuel tank goes up when it is hit hard.', build: buildSkidder },
  'forest-cabin': { ...BUILT, name: 'Crew Cabin', size: [1, 1], blurb: 'A log cabin on a stone footing: gable roof, stone chimney, a porch lamp, lit windows and a woodpile.', build: buildCabin },
  'forest-tower': { ...BUILT, name: 'Fire Lookout', size: [1, 1], blurb: 'A ranger\'s fire lookout: a steel tower with stair flights inside and a windowed cab on top, a red light on the roof.', build: buildTower },
  'forest-dam': { ...BUILT, name: 'Hydro Dam', size: [4, 2], blurb: 'A small concrete dam across the river: the reservoir behind it, three spillway gates pouring into foam, a powerhouse with a transformer yard.', build: buildDam },
  'forest-pylon': { ...BUILT, name: 'Power Pylon', size: [1, 1], blurb: 'A steel lattice pylon carrying the line from the dam, insulators on two cross-arms and a red light on top.', build: buildPylon },
});
