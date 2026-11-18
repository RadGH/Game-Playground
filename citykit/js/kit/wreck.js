// Wreck stages for every building: a post-process on ANY finished recipe model (homes, shops, industry, services,
// parks, landmarks, zoned…), so no recipe needs its own damaged version.
//
//   0 Whole    — untouched.
//   1 Damaged  — soot and cracks on the walls, broken dark windows, many windows out, a chunk knocked off a top
//                corner (its floors showing), a small pile of debris at the foot of the wall.
//   2 Burning  — a big bite out of a top corner (and a hole punched in the side of a tall one), jagged roofline,
//                broken floor slabs and bent rebar at every cut, fire in the holes and in the windows round them (glow
//                material, so it shines in the night picture), the power out, heavy soot, a bigger debris pile.
//   3 Rubble   — collapsed: a heap of slabs, beams and chunks the size of the lot, a few wall stubs still standing,
//                charred tree stumps, embers still glowing in the heap.
//
// How it cuts: every box in the model (storeys, slabs, signs, walls — anything built from a BoxGeometry, at any
// rotation) is split into cells (one per storey, ~0.22 tiles across) in its own space; a cell goes when its centre is
// inside the stage's "gone" region (a seeded, jittered blast shape, or above the stage-3 stub height). What is left is
// rebuilt column by column with its facade texture mapped to the same windows, and the new inside faces show bare
// floors. Other shapes (domes, cylinders, trees, signs) go when they sit in the region or lose what held them up.
//
// Seeded and repeatable: same model + stage + seed → same wreck. Nothing is added outside the lot (±size/2).
import * as THREE from 'three';
import { rng } from './rng.js';
import { FLOOR } from '../iso.js';
import { neonMat, STYLES } from './materials.js';

export const DAMAGE_NAMES = ['Whole', 'Damaged', 'Burning', 'Rubble'];
const GROUND = 0.06;        // nothing whose centre is below this is cut (the lot's pavement)
const EDGE = 0.012;         // keep additions this far inside the lot edge

// ---------------------------------------------------------------- caches, textures, materials
const cache = new Map();
const cached = (k, make) => { if (!cache.has(k)) cache.set(k, make()); return cache.get(k); };

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Soot blotches + cracks on a transparent background (variant v). */
function scorchTex(v) {
  return cached(`tex:scorch${v}`, () => canvasTex(128, 128, (g, W, H) => {
    const R = rng(311 + v * 17);
    for (let i = 0; i < 7; i++) {
      const x = W * R.range(0.25, 0.75), y = H * R.range(0.3, 0.75), r = W * R.range(0.12, 0.34);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(10,8,6,0.92)'); gr.addColorStop(0.55, 'rgba(18,14,10,0.55)'); gr.addColorStop(1, 'rgba(20,16,12,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    // smoke streaks running up the wall
    for (let i = 0; i < 5; i++) {
      const x = W * R.range(0.3, 0.7), w = W * R.range(0.05, 0.14);
      const gr = g.createLinearGradient(0, H * 0.6, 0, 0);
      gr.addColorStop(0, 'rgba(14,12,10,0.6)'); gr.addColorStop(1, 'rgba(14,12,10,0)');
      g.fillStyle = gr; g.fillRect(x - w / 2, 0, w, H * 0.6);
    }
    g.strokeStyle = 'rgba(5,4,3,0.9)'; g.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) {
      let x = W * R.range(0.3, 0.7), y = H * R.range(0.3, 0.7); g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += R.range(-12, 12); y += R.range(-12, 12); g.lineTo(x, y); }
      g.stroke();
    }
  }));
}
/** Smashed windows: jagged black holes with a charred rim. */
function holesTex(v) {
  return cached(`tex:holes${v}`, () => canvasTex(64, 64, (g, W, H) => {
    const R = rng(97 + v * 29);
    const gr = g.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W * 0.5);
    gr.addColorStop(0, 'rgba(12,10,8,0.85)'); gr.addColorStop(1, 'rgba(12,10,8,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = '#050505'; g.beginPath();
    const n = 11;
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, r = W * R.range(0.16, 0.36); g[i ? 'lineTo' : 'moveTo'](W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r * 0.9); }
    g.closePath(); g.fill();
  }));
}
/** Windows on fire: orange/yellow blotches on transparent, laid out on a window grid. */
function fireTex(v) {
  return cached(`tex:fire${v}`, () => canvasTex(64, 64, (g, W, H) => {
    const R = rng(53 + v * 41);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      if (R() < 0.3) continue;
      const x = 4 + col * 20, y = 6 + row * 20, w = 15, h = 12;
      const gr = g.createLinearGradient(0, y + h, 0, y);
      gr.addColorStop(0, '#ffe07a'); gr.addColorStop(0.5, '#ff8a1e'); gr.addColorStop(1, '#c2300c');
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,120,30,0.35)'; g.fillRect(x - 2, y - 4, w + 4, 4);   // glow licking the lintel
    }
  }));
}
/** The inside of a floor seen through a cut: dark room, a lighter slab edge at the bottom, a column now and then. */
function interiorTex() {
  return cached('tex:interior', () => canvasTex(64, 64, (g, W, H) => {
    const R = rng(7);
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1a1816'); gr.addColorStop(1, '#3a3530');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = '#4a4540'; g.fillRect(10, 0, 6, H); g.fillRect(44, 0, 6, H);           // columns
    g.fillStyle = '#8d877e';                                                              // the floor slab, broken edge
    g.beginPath(); g.moveTo(0, H); g.lineTo(0, H - 10);
    for (let x = 0; x <= W; x += 4) g.lineTo(x, H - 10 - R.range(0, 4));
    g.lineTo(W, H); g.closePath(); g.fill();
    g.fillStyle = '#5c5650'; g.fillRect(0, H - 3, W, 3);
  }, true));
}
/** Bare broken floor seen from above: concrete with dust and dark specks. */
function floorTex() {
  return cached('tex:floor', () => canvasTex(64, 64, (g, W, H) => {
    const R = rng(13);
    g.fillStyle = '#4c4843'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 160; i++) { g.fillStyle = R() < 0.5 ? 'rgba(30,26,22,0.5)' : 'rgba(170,162,150,0.45)'; const s = R.range(1, 4); g.fillRect(R() * W, R() * H, s, s); }
    g.strokeStyle = 'rgba(20,18,16,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, R() * H); for (let x = 0; x < W; x += 8) g.lineTo(x, R() * H); g.stroke();
  }, true));
}

const markWreck = m => { m.userData.wreck = true; return m; };
const interiorMat = () => cached('m:interior', () => markWreck(new THREE.MeshStandardMaterial({ map: interiorTex(), roughness: 0.95, metalness: 0 })));
const floorMat = () => cached('m:floor', () => markWreck(new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.95, metalness: 0 })));
/** A decal: drawn on top of a wall by day; in the night picture it darkens what is behind it (bake.js `decal`). */
function decalMat(kind, v) {
  return cached(`m:decal:${kind}${v}`, () => {
    const m = new THREE.MeshStandardMaterial({ map: kind === 'holes' ? holesTex(v) : scorchTex(v), transparent: true, depthWrite: false, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.userData.decal = true; return markWreck(m);
  });
}
function fireWinMat(v) {
  return cached(`m:firewin${v}`, () => {
    const t = fireTex(v);
    const m = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 1, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    m.userData.glow = true; m.userData.dayGlow = 0.8; return markWreck(m);
  });
}
const rubbleMat = color => cached(`m:rubble:${color}`, () => markWreck(new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.05, flatShading: true })));
const steelMat = () => cached('m:rebar', () => markWreck(new THREE.MeshStandardMaterial({ color: '#4a3a30', roughness: 0.7, metalness: 0.6 })));
const smokeMat = i => cached(`m:smoke${i % 3}`, () => markWreck(new THREE.MeshStandardMaterial({ color: ['#2c2926', '#3a3632', '#24211f'][i % 3], roughness: 1, metalness: 0, flatShading: true })));
const charMat = () => cached('m:char', () => markWreck(new THREE.MeshStandardMaterial({ color: '#1b1714', roughness: 1, metalness: 0 })));
const FLAME_OUT = () => markWreck(neonMat('#ff5a14', 0.9));
const FLAME_IN = () => markWreck(neonMat('#ffd25a', 1));
const EMBERS = () => [markWreck(neonMat('#ff4a10', 0.35)), markWreck(neonMat('#ff8a24', 0.45)), markWreck(neonMat('#c42a0a', 0.25))];

const SOOT = new THREE.Color('#1d1915');
/** A building material as this stage leaves it: windows and neon out (wholly or partly), walls sooty. Never mutates
 *  the shared original; clones are cached per (material, glow share, soot). */
function stageMat(m, glowK, soot) {
  if (!m || m.userData?.wreck) return m;
  const isGlow = !!m.userData?.glow;
  const k = isGlow ? glowK : 1;
  if (k === 1 && soot === 0) return m;
  return cached(`st:${m.uuid}:${k}:${soot}`, () => {
    const c = m.clone(); delete c.userData._ei;
    if (isGlow) {
      const base = m.userData._ei ?? m.emissiveIntensity ?? 1;
      if (k <= 0) {
        c.userData.glow = false; if (c.emissive) c.emissive.setRGB(0, 0, 0); c.emissiveMap = null; c.emissiveIntensity = 0;
        if (!c.map && c.color) c.color.multiplyScalar(0.32);            // an unlit neon tube is a dark tube
      } else c.emissiveIntensity = base * k;
    }
    if (soot > 0 && c.color) c.color.lerp(SOOT, soot);
    c.userData.wreck = true; c.userData.wreckOf = m.uuid;
    return c;
  });
}

// ---------------------------------------------------------------- small maths
function hash(a, b, c, s) {
  let h = Math.imul((Math.round(a * 97) * 73856093) ^ (Math.round(b * 97) * 19349663) ^ (Math.round(c * 97) * 83492791) ^ (s * 2654435761), 0x9e3779b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FACE_AXIS = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];   // BoxGeometry face order: +x −x +y −y +z −z
const AX = ['x', 'y', 'z'];

/** For each face of an (unsegmented) BoxGeometry: which local axis drives u and v, and how. */
function uvMaps(geo) {
  const pos = geo.attributes.position, uv = geo.attributes.uv, maps = [];
  for (let f = 0; f < 6; f++) {
    const i0 = f * 4, p = i => [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const a = p(i0), b = p(i0 + 1), c = p(i0 + 2);
    const au = [0, 1, 2].find(k => Math.abs(a[k] - b[k]) > 1e-9), av = [0, 1, 2].find(k => Math.abs(a[k] - c[k]) > 1e-9);
    maps.push({
      au, u0: uv.getX(i0), su: (uv.getX(i0 + 1) - uv.getX(i0)) / (b[au] - a[au]), pu: a[au],
      av, v0: uv.getY(i0), sv: (uv.getY(i0 + 2) - uv.getY(i0)) / (c[av] - a[av]), pv: a[av],
    });
  }
  return maps;
}

// ---------------------------------------------------------------- the wreck
/**
 * Turn a finished recipe model into damage stage `stage` (0..3). Mutates and returns `root`.
 * opts: size [w, d] (the lot, tiles; nothing is added outside ±size/2), style (for rubble colours).
 */
export function wreck(root, stage, seed = 1, { size = null, style = 'chrome', smoke: withSmoke = true } = {}) {
  stage = clamp(Math.round(stage || 0), 0, 3);
  if (!stage) return root;
  const R = rng(seed * 7919 + stage * 131 + 17);
  const S = seed * 31 + 7;
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const relOf = o => new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);

  // ---- what is there
  const meshes = [];
  root.traverse(o => { if (o.isMesh) meshes.push(o); });
  const all = new THREE.Box3();
  const info = meshes.map(m => {
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const rel = relOf(m), b = m.geometry.boundingBox.clone().applyMatrix4(rel);
    all.union(b);
    const gp = m.geometry.parameters || {};
    const isBox = m.geometry.type === 'BoxGeometry' && (gp.widthSegments ?? 1) === 1 && (gp.heightSegments ?? 1) === 1 && (gp.depthSegments ?? 1) === 1;
    return { m, rel, b, isBox };
  });
  const [lw, ld] = size || [Math.max(1, Math.ceil(all.max.x - all.min.x)), Math.max(1, Math.ceil(all.max.z - all.min.z))];
  const lim = { x: lw / 2 - EDGE, z: ld / 2 - EDGE };
  // structure = the boxes that are the building (storeys, podiums), not trims and props
  let structure = info.filter(i => i.isBox && i.b.max.y - i.b.min.y > FLOOR * 0.6 && (i.b.max.x - i.b.min.x) * (i.b.max.z - i.b.min.z) > 0.03 && i.b.max.y > GROUND * 2);
  if (!structure.length) structure = info.filter(i => i.b.max.y > GROUND && (i.b.max.x - i.b.min.x) < lw * 0.95);
  if (!structure.length) structure = info;
  const foot = new THREE.Box3(); structure.forEach(i => foot.union(i.b));
  // the main mass (a tower over its podium): where the rubble stage's wall stubs stand
  const core = new THREE.Box3(); structure.filter(i => i.b.max.y - Math.max(0, i.b.min.y) >= 0.45 * foot.max.y || i.b.max.y >= 0.6 * foot.max.y).forEach(i => core.union(i.b));
  if (core.isEmpty()) core.copy(foot);
  // a box whose top nothing else stands on: only those get a jagged roofline (a jagged mid-section would bring down
  // everything above it)
  const overlapXZ = (a, b) => a.min.x < b.max.x - 0.02 && a.max.x > b.min.x + 0.02 && a.min.z < b.max.z - 0.02 && a.max.z > b.min.z + 0.02;
  for (const i of info) i.capped = info.some(o => o !== i && o.b.min.y >= i.b.max.y - 0.03 && o.b.max.y - o.b.min.y > FLOOR * 0.5 && overlapXZ(i.b, o.b));
  const Hs = Math.max(FLOOR * 0.5, foot.max.y);
  // the blast hits the main block: the biggest box reaching near the top (not a small penthouse or crown)
  const vol = i => (i.b.max.x - i.b.min.x) * (i.b.max.y - Math.max(0, i.b.min.y)) * (i.b.max.z - i.b.min.z);
  const topMax = Math.max(...structure.map(i => i.b.max.y));
  const tallest = structure.filter(i => i.b.max.y >= topMax - Math.max(FLOOR * 2.5, topMax * 0.2)).reduce((a, i) => (vol(i) > vol(a) ? i : a));
  const T = tallest.b, tw = T.max.x - T.min.x, td = T.max.z - T.min.z, th = T.max.y - Math.max(T.min.y, 0);
  // the blast corner: the camera sees +x/+z, so favour the front corner, then the two side corners
  const corner = R.pick([[1, 1], [1, 1], [1, -1], [-1, 1]]);
  const cx0 = (T.min.x + T.max.x) / 2, cz0 = (T.min.z + T.max.z) / 2;

  // ---- the "gone" region for this stage
  const blasts = [];
  if (stage === 1) {
    const rh = Math.min(0.2, 0.42 * Math.min(tw, td)) + 0.02;
    blasts.push({ x: cx0 + corner[0] * tw / 2, y: T.max.y + 0.02, z: cz0 + corner[1] * td / 2, rh, rv: FLOOR * 1.5, floor: T.max.y - FLOOR * 1.6 });
  } else if (stage === 2) {
    const rh = 0.5 * Math.min(tw, td) + 0.08;
    const rv = Math.min(th * 0.62, Math.max(rh * 1.5, FLOOR * 3));
    blasts.push({ x: cx0 + corner[0] * tw * 0.42, y: T.max.y + 0.04, z: cz0 + corner[1] * td * 0.42, rh, rv, floor: -1 });
    if (th > 1.1) {   // a hole punched through the side of a tall one, on a face the camera sees
      const face = R.pick([[1, 0], [0, 1]]), y = T.max.y - th * R.range(0.35, 0.6);
      blasts.push({ x: face[0] ? T.max.x : cx0 + R.range(-0.25, 0.25) * tw, y, z: face[1] ? T.max.z : cz0 + R.range(-0.25, 0.25) * td, rh: rh * 0.62, rv: FLOOR * R.range(1.6, 2.6), floor: -1, hole: true });
    }
  }
  // stage 3: what still stands — low jagged stubs everywhere, a couple of taller wall stubs toward the back
  const stubs = [];
  if (stage === 3) {
    const n = Hs > FLOOR * 3 ? R.int(2, 3) : 1;
    const heapPeak = clamp(0.06 + Hs * 0.22, 0.1, 1.1);
    const backs = [[-1, -1], [-1, 1], [1, -1], [-1, -1]];
    for (let i = 0; i < n; i++) {
      const c = backs[(i + seed) % backs.length];
      stubs.push({ x: (core.min.x + core.max.x) / 2 + c[0] * (core.max.x - core.min.x) * R.range(0.3, 0.45), z: (core.min.z + core.max.z) / 2 + c[1] * (core.max.z - core.min.z) * R.range(0.3, 0.45),
        h: Math.min(Hs * 0.5, Math.max(heapPeak * 1.5, FLOOR * R.range(2.2, 5.5))), r: R.range(0.18, 0.3) });
    }
  }
  const stubH = (x, z) => {
    // the outer walls stand ragged (one to three storeys, with gaps); inside, everything came down under the heap
    const e = Math.min(x - core.min.x, core.max.x - x, z - core.min.z, core.max.z - z);
    const r = hash(x, 0, z, S);
    let h = e < 0.15 && r > 0.3 ? Math.min(Hs * 0.55, FLOOR * (0.7 + r * 2.4)) : Math.min(Hs * 0.3, FLOOR * r * 0.7);
    for (const s of stubs) { const d = Math.hypot(x - s.x, z - s.z); if (d < s.r) h = Math.max(h, s.h * (1 - (d / s.r) ** 2 * 0.55) * (0.75 + hash(x, 1, z, S) * 0.25)); }
    return h;
  };
  /** 0 = outside every blast, 1 = in the top blast, 2 = only in a side hole (what is above a hole may stay). */
  const inBlast = (x, y, z) => {
    let hit = 0;
    for (const b of blasts) {
      if (b.floor > 0 && y < b.floor) continue;
      const q = ((x - b.x) ** 2 + (z - b.z) ** 2) / b.rh ** 2 + (y - b.y) ** 2 / b.rv ** 2;
      if (q < 1 + (hash(x, y, z, S) - 0.5) * 0.7) { if (!b.hole) return 1; hit = 2; }
    }
    return hit;
  };
  /** Is this point (root space) gone? 0 stays, 1 gone (and so is everything resting on it), 2 gone in a side hole.
   *  ctx (box cells only): { rows, fromTop, thin } for the jagged roofline and loose trim. */
  const gone = (x, y, z, ctx = null) => {
    if (y < GROUND) return 0;
    if (stage === 3) return y > stubH(x, z) || (ctx?.thin && !ctx.capped && y > FLOOR * 0.8) ? 1 : 0;
    const b = inBlast(x, y, z); if (b) return b;
    if (stage === 2 && ctx && ctx.rows >= 2) {
      const r = hash(x, y, z, S + 5);
      if (ctx.capped) return 0;
      if (ctx.fromTop === 0 && r < 0.34) return 1;
      if (ctx.fromTop === 1 && r < 0.1 && ctx.rows >= 4) return 1;
    }
    return 0;
  };
  // cells already knocked out (root-space boxes): anything resting on one of them falls too
  const fallen = [];
  const besideFallen = (x, y, z, pad = 0.07) => fallen.some(b => x >= b[0] - pad && x <= b[1] + pad && y >= b[2] && y <= b[3] && z >= b[4] - pad && z <= b[5] + pad);
  const restsOnFallen = (x, y, z) => y > GROUND && fallen.some(b => x >= b[0] && x <= b[1] && y >= b[2] && y <= b[3] && z >= b[4] && z <= b[5]);

  // ---- cut the boxes (lowest first, so what they held up knows they are gone)
  const cutTops = [];      // exposed tops of what is left: { mesh, x, y, z (local), w, d } — for slabs, rebar, fire
  const sideFaces = [];    // outer side faces left standing: { mesh, f, c (local centre), u, v (sizes), root (Vector3) }
  const added = [];
  const tmp = new THREE.Vector3();
  const order = info.filter(i => i.isBox).sort((a, b) => a.b.min.y - b.b.min.y);
  for (const it of order) {
    if (!it.m.parent) continue;
    const m = it.m, gp = m.geometry.parameters, W = gp.width, H = gp.height, D = gp.depth;
    // grid sized in ROOT units (a scaled box still gets ~storey-high rows)
    const sc = new THREE.Vector3(); it.rel.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc);
    const nx = clamp(Math.round(W * sc.x / 0.22), 1, 5), nz = clamp(Math.round(D * sc.z / 0.22), 1, 5);
    const ny = clamp(Math.round(H * sc.y / FLOOR), 1, 90);
    const thin = H * sc.y < FLOOR * 0.6;
    // a cell's half size in root space (abs of the box's turn), for the fallen list and the support check
    const e3 = new THREE.Matrix3().setFromMatrix4(it.rel).elements.map(Math.abs);
    const hx = W / nx / 2, hy = H / ny / 2, hz = D / nz / 2;
    const half = [e3[0] * hx + e3[3] * hy + e3[6] * hz, e3[1] * hx + e3[4] * hy + e3[7] * hz, e3[2] * hx + e3[5] * hy + e3[8] * hz];
    const cell = (ix, iy, iz) => [-W / 2 + (ix + 0.5) * W / nx, -H / 2 + (iy + 0.5) * H / ny, -D / 2 + (iz + 0.5) * D / nz];
    const keep = [];
    let anyGone = false;
    const lost = [];
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
      let fell = false;
      for (let iy = 0; iy < ny; iy++) {
        const c = cell(ix, iy, iz); tmp.set(...c).applyMatrix4(it.rel);
        let g = fell ? 1 : gone(tmp.x, tmp.y, tmp.z, { rows: ny, fromTop: ny - 1 - iy, thin, capped: it.capped });
        if (!g && iy === 0 && restsOnFallen(tmp.x, tmp.y - half[1] - 0.02, tmp.z)) g = 1;
        // trim hung on a wall (balconies, ledges, signs) goes with the wall beside it
        if (!g && thin && !it.capped && stage >= 2 && besideFallen(tmp.x, tmp.y, tmp.z)) g = 1;
        if (g === 1) fell = true;
        keep[(ix * nz + iz) * ny + iy] = !g;
        if (g) { anyGone = true; lost.push([tmp.x - half[0], tmp.x + half[0], tmp.y - half[1], tmp.y + half[1], tmp.z - half[2], tmp.z + half[2]]); }
      }
    }
    fallen.push(...lost);
    if (!anyGone) { collectFaces(it, m, W, H, D, null); continue; }
    const maps = uvMaps(m.geometry);
    const mats = Array.isArray(m.material) ? m.material : Array(6).fill(m.material);
    const parent = m.parent;
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
      let iy = 0;
      while (iy < ny) {
        if (!keep[(ix * nz + iz) * ny + iy]) { iy++; continue; }
        let j = iy; while (j + 1 < ny && keep[(ix * nz + iz) * ny + j + 1]) j++;
        const x0 = -W / 2 + ix * W / nx, x1 = x0 + W / nx, z0 = -D / 2 + iz * D / nz, z1 = z0 + D / nz;
        const y0 = -H / 2 + iy * H / ny, y1 = -H / 2 + (j + 1) * H / ny;
        const piece = subBox(m, maps, mats, [x0, x1, y0, y1, z0, z1], [W, H, D], H / ny);
        parent.add(piece);
        const pinfo = { m: piece, rel: it.rel };
        collectFaces(pinfo, piece, x1 - x0, y1 - y0, z1 - z0, [x0, x1, y0, y1, z0, z1, W, H, D]);
        if (j < ny - 1) cutTops.push({ owner: it, mesh: piece, rel: it.rel, x: (x0 + x1) / 2, y: y1, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, sc });
        iy = j + 1;
      }
    }
    parent.remove(m);
    it.removed = true;
  }

  /** Outer side faces of a standing box (for soot, smashed windows and fire). orig: the piece's span in the original
   *  box [x0,x1,y0,y1,z0,z1,W,H,D], or null for a box left whole. */
  function collectFaces(it, mesh, W, H, D, orig) {
    const off = orig ? [(orig[0] + orig[1]) / 2, (orig[2] + orig[3]) / 2, (orig[4] + orig[5]) / 2] : [0, 0, 0];
    for (const f of [0, 1, 4, 5]) {
      const [ax, sg] = FACE_AXIS[f];
      if (orig) {   // only faces that were on the outside of the original box
        const edge = ax === 0 ? (sg > 0 ? orig[1] - orig[6] / 2 : orig[0] + orig[6] / 2) : (sg > 0 ? orig[5] - orig[8] / 2 : orig[4] + orig[8] / 2);
        if (Math.abs(edge) > 1e-6) continue;
      }
      const u = ax === 0 ? D : W;
      if (u < 0.07 || H < 0.07) continue;
      const c = [...off]; c[ax] += sg * (ax === 0 ? W : D) / 2;
      sideFaces.push({ mesh, ax, sg, c, u, v: H, root: new THREE.Vector3(...c).applyMatrix4(it.rel) });
    }
  }

  // ---- other shapes: drop what is in the region or has lost its support; char the tree trunks of a rubble lot
  for (const it of info) {
    if (it.isBox || !it.m.parent) continue;
    const b = it.b, c = b.getCenter(new THREE.Vector3());
    let drop = !!gone(c.x, c.y, c.z) || (b.min.y > GROUND && (restsOnFallen(c.x, b.min.y - 0.02, c.z) || (stage >= 2 && gone(c.x, b.min.y - 0.02, c.z) === 1)));
    if (stage === 3 && b.min.y > GROUND && b.min.y > stubH(c.x, c.z) - 0.02) drop = true;
    if (!drop) continue;
    fallen.push([b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z]);
    const sx = b.max.x - b.min.x, sz = b.max.z - b.min.z, hh = b.max.y - b.min.y;
    it.m.parent.remove(it.m); it.removed = true;
    if (stage === 3 && b.min.y < GROUND && sx < 0.12 && sz < 0.12 && hh > 0.08) {   // a tree trunk or pole: a charred stump
      const r = Math.max(0.006, Math.min(sx, sz) * 0.3), sh = Math.min(0.1, hh * 0.3);
      const stump = new THREE.Mesh(cylGeo(r * 0.7, r, sh, 7), charMat());
      stump.position.set(c.x, b.min.y + sh / 2, c.z); stump.rotation.z = R.range(-0.25, 0.25); stump.castShadow = true;
      root.add(stump); added.push(stump);
    }
  }

  // ---- anything left resting on something that fell (a beacon on a fallen mast, a sign on a fallen wall)
  for (let pass = 0; pass < 2; pass++) {
    const left = []; root.traverse(o => { if (o.isMesh && !o.userData.wreckPiece) left.push(o); });
    for (const o of left) {
      if (!o.parent) continue;
      const b = new THREE.Box3().setFromObject(o, true).applyMatrix4(inv), c = b.getCenter(new THREE.Vector3());
      if (b.min.y > GROUND + 0.01 && restsOnFallen(c.x, b.min.y - 0.02, c.z)) { fallen.push([b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z]); o.parent.remove(o); }
    }
  }

  // ---- what stays: windows out, soot
  const glowK = stage === 1 ? null : 0, soot = [0, 0.08, 0.32, 0.5][stage];
  root.traverse(o => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const next = list.map((m, f) => {
      if (m?.userData?.wreck) return m;
      let k = glowK;
      if (k === null) {   // damaged: whole faces of windows dark, a third of the neon dead
        const facade = !!m?.emissiveMap;
        const r = hash(o.position.x + f * 0.37, o.position.y, o.position.z, S + 9);
        k = facade ? (r < 0.45 ? 0 : r < 0.7 ? 0.35 : 1) : (hash(0, f, m?.id ?? 0, S + 3) < 0.33 ? 0 : 1);
      }
      return stageMat(m, k, soot);
    });
    o.material = Array.isArray(o.material) ? next : next[0];
  });

  // ---- broken floor slabs + rebar at the cuts, fire in them
  // a cut top hidden inside another block that still stands (overlapping boxes) gets no fire or slab
  const covered = t => {
    const q = new THREE.Vector3(t.x, t.y, t.z).applyMatrix4(t.rel); q.y += 0.03;
    return info.some(o => o.isBox && o !== t.owner && o.b.containsPoint(q) && o.b.max.y - o.b.min.y > 0.05 && !gone(q.x, q.y, q.z));
  };
  for (let i = cutTops.length - 1; i >= 0; i--) if (covered(cutTops[i])) cutTops.splice(i, 1);
  const lipsN = stage === 1 ? 4 : stage === 2 ? 16 : 10;
  const tops = shuffle(cutTops, R);
  const blastC = blasts[0] ? new THREE.Vector3(blasts[0].x, blasts[0].y, blasts[0].z) : null;
  tops.slice(0, lipsN).forEach((t, i) => {
    const sl = new THREE.Mesh(boxGeo(t.w * R.range(0.8, 1.05), 0.02 / Math.max(0.3, t.sc.y), t.d * R.range(0.8, 1.05)), floorMat());
    sl.position.set(t.x + R.range(-0.02, 0.02), t.y + 0.008, t.z + R.range(-0.02, 0.02));
    sl.rotation.set(R.range(-0.18, 0.18), R.range(-0.3, 0.3), R.range(-0.18, 0.18));
    addLocal(t.mesh.parent, sl, t.rel);
    const nr = R.int(2, 4);
    for (let k = 0; k < nr; k++) {
      const L = R.range(0.035, 0.09) / Math.max(0.3, t.sc.y);
      const rb = new THREE.Mesh(cylGeo(0.004, 0.004, L, 4), steelMat());
      rb.position.set(t.x + R.range(-t.w, t.w) * 0.45, t.y + L * 0.4, t.z + R.range(-t.d, t.d) * 0.45);
      rb.rotation.set(R.range(-0.7, 0.7), 0, R.range(-0.7, 0.7));
      addLocal(t.mesh.parent, rb, t.rel);
    }
  });

  if (stage === 3) for (const t of tops.slice(0, 3)) flames(t.mesh.parent, t.rel, t.x, t.y, t.z, Math.min(t.w, t.d), 0.5);
  // stage 2: fires on whatever is now the top surface round each blast (found by dropping a ray from the sky, so a
  // fire is never buried inside a block that still stands, and parks and sheds burn too)
  if (stage === 2) {
    root.updateMatrixWorld(true);
    const solid = [];
    root.traverse(o => { if (o.isMesh && !Array.isArray(o.material) && (o.material?.userData?.decal || (o.material?.userData?.glow && o.material?.userData?.wreck))) return; if (o.isMesh) solid.push(o); });
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
    blasts.forEach((b, bi) => {
      const n = bi === 0 ? 10 : 0;   // a side hole burns through its windows (below)
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, rr = b.rh * Math.sqrt(R()) * 0.85;
        const x = clamp(b.x + Math.cos(a) * rr, -lim.x + 0.05, lim.x - 0.05), z = clamp(b.z + Math.sin(a) * rr, -lim.z + 0.05, lim.z - 0.05);
        ray.set(new THREE.Vector3(x, Hs + 5, z).applyMatrix4(root.matrixWorld), down);
        const hit = ray.intersectObjects(solid, false)[0];
        if (!hit) continue;
        const y = hit.point.clone().applyMatrix4(inv).y;
        if (y < b.y - b.rv * 1.25 && y > GROUND + 0.05) continue;   // fell through a gap onto a lower roof: not this fire
        flames(root, new THREE.Matrix4(), x, y, z, clamp(b.rh * 0.45, 0.12, 0.35), 1);
      }
    });
  }
  if (stage === 2 && blastC && withSmoke) smoke(clamp(blasts[0].x, -lim.x, lim.x), T.max.y, clamp(blasts[0].z, -lim.z, lim.z), clamp(blasts[0].rh * 0.32, 0.05, 0.22));

  // ---- soot, smashed windows and windows on fire on the walls left standing (faces the camera sees first: +x, +z)
  const faces = shuffle(sideFaces.filter(sf => sf.root.y > GROUND), R).sort((a, b) => (b.sg > 0 ? 1 : 0) - (a.sg > 0 ? 1 : 0) || 0);
  const nScorch = [0, 8, 14, 6][stage], nHoles = [0, 9, 10, 0][stage], nFire = [0, 0, 9, 0][stage];
  const byBlast = blastC ? [...faces].sort((a, b) => a.root.distanceTo(blastC) - b.root.distanceTo(blastC)) : faces;
  faces.slice(0, nScorch).forEach((sf, i) => decal(sf, decalMat('scorch', i % 4), R.range(0.2, 0.45), R.range(0.22, 0.5), stage >= 2 ? 0.7 : 0.4));
  byBlast.slice(0, Math.ceil(nScorch / 2)).forEach((sf, i) => decal(sf, decalMat('scorch', (i + 2) % 4), R.range(0.25, 0.5), R.range(0.3, 0.6), 0.85));
  faces.slice(nScorch, nScorch + nHoles).forEach((sf, i) => decal(sf, decalMat('holes', i % 3), R.range(0.08, 0.16), R.range(0.07, 0.14), 0.5));
  byBlast.slice(0, nFire).forEach((sf, i) => decal(sf, fireWinMat(i % 3), R.range(0.12, 0.28), R.range(0.1, 0.24), 0.95, true));
  if (stage === 2 && blasts[1]) {   // the side hole: windows burning round it
    const hc = new THREE.Vector3(blasts[1].x, blasts[1].y, blasts[1].z);
    [...faces].sort((a, b) => a.root.distanceTo(hc) - b.root.distanceTo(hc)).slice(0, 5).forEach((sf, i) => {
      const local = hc.clone(); // place the burning windows at the hole's height on that face
      decal(sf, fireWinMat((i + 1) % 3), R.range(0.14, 0.26), R.range(0.12, 0.22), clamp((local.y - sf.root.y) / Math.max(0.05, sf.v / 2), -1, 1) * 0.9, true, true);
    });
  }

  function decal(sf, mat, u, v, upBias, front = false, exact = false) {
    u = Math.min(u, sf.u * 0.9); v = Math.min(v, sf.v * 0.9);
    if (u < 0.04 || v < 0.04) return;
    const [ax, sg] = [sf.ax, sf.sg];
    const pl = new THREE.Mesh(planeGeo(u, v), mat);
    const along = R.range(-(sf.u - u) / 2, (sf.u - u) / 2);
    const up = (sf.v - v) / 2 * clamp(upBias + (exact ? R.range(-0.08, 0.08) : R.range(-0.4, 0.3)), -1, 1);
    const p = [...sf.c]; p[1] += up; p[ax] += sg * (front ? 0.004 : 0.003); p[ax === 0 ? 2 : 0] += along;
    pl.position.set(...p);
    pl.rotation.y = ax === 0 ? sg * Math.PI / 2 : (sg > 0 ? 0 : Math.PI);
    pl.castShadow = false; pl.receiveShadow = true; pl.renderOrder = front ? 3 : 2;
    sf.mesh.add(pl);
    // keep it inside the lot (a wall can stand right on the edge)
    pl.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(pl, true).applyMatrix4(inv);
    if (bb.max.x > lim.x || bb.min.x < -lim.x || bb.max.z > lim.z || bb.min.z < -lim.z) sf.mesh.remove(pl); else added.push(pl);
  }

  /** A fire: a glowing bed with tongues of flame licking up (tall thin cones, a hot yellow core). */
  function flames(parent, rel, x, y, z, span, k) {
    const r = clamp(span * R.range(0.2, 0.32), 0.022, 0.09) * k;
    const bed = new THREE.Mesh(lumpGeo(seed + 3), FLAME_OUT()); bed.scale.set(r * 1.2, r * 0.5, r * 1.2); bed.position.set(x, y - 0.004, z);
    addLocal(parent, bed, rel, true);
    const n = R.int(3, 5);
    for (let i = 0; i < n; i++) {
      const rr = r * R.range(0.28, 0.5), h = r * R.range(2.2, 4.6) * (i === 0 ? 1.25 : 1);
      const px = x + R.range(-r, r) * 0.6, pz = z + R.range(-r, r) * 0.6;
      const o = new THREE.Mesh(cylGeo(0, rr, h, 6), FLAME_OUT()); o.position.set(px, y + h / 2, pz);
      addLocal(parent, o, rel, true, [R.range(-0.22, 0.22), R() * 6, R.range(-0.22, 0.22)]);
      if (i < 2) { const c = new THREE.Mesh(cylGeo(0, rr * 0.6, h * 0.55, 5), FLAME_IN()); c.position.set(px, y + h * 0.27, pz); addLocal(parent, c, rel, true); }
    }
    return r;
  }
  /** Dark smoke rising from a fire, drifting back (away from the camera) so it never hides the front. */
  function smoke(x, y, z, size) {
    const n = R.int(4, 6), dx = -R.range(0.4, 0.8), dz = -R.range(0.4, 0.8);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), r = size * (0.5 + t * 0.8) * R.range(0.8, 1.2);
      x += R.range(-0.3, 0.3) * size; z += R.range(-0.3, 0.3) * size;
      const px = clamp(x + dx * t * size * 3.4, -lim.x + r * 1.1, lim.x - r * 1.1), pz = clamp(z + dz * t * size * 3.4, -lim.z + r * 1.1, lim.z - r * 1.1);
      if (r * 1.1 > Math.min(lim.x, lim.z)) continue;
      const m = new THREE.Mesh(puffGeo(), smokeMat(i)); m.scale.set(r, r * 0.8, r); m.position.set(px, y + size * 0.6 + t * size * 2.6, pz); m.rotation.y = R() * 3;
      m.castShadow = false; addRoot(m, true);
    }
  }
  /** Add a mesh given in a box's local frame. rel maps that frame to root space; parent is where the box lived. */
  function addLocal(parent, mesh, rel, flame = false, tilt = null) {
    // re-express in root space so scaled/rotated parents don't stretch rebar and flames
    const keepScale = mesh.scale.clone();
    const mw = new THREE.Matrix4().compose(mesh.position, mesh.quaternion, new THREE.Vector3(1, 1, 1));
    const world = new THREE.Matrix4().multiplyMatrices(rel, mw);
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    world.decompose(pos, q, s);
    if (flame) { q.identity(); if (tilt) q.setFromEuler(new THREE.Euler(...tilt)); }   // flames point up whatever the box did
    mesh.position.copy(pos); mesh.quaternion.copy(q); mesh.scale.copy(keepScale);
    mesh.castShadow = !flame; mesh.receiveShadow = true;
    root.add(mesh);
    mesh.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(mesh, true).applyMatrix4(inv);
    if (bb.max.x > lim.x || bb.min.x < -lim.x || bb.max.z > lim.z || bb.min.z < -lim.z) root.remove(mesh); else added.push(mesh);
    void parent;
  }

  // ---- debris on the ground
  const colours = rubbleColours(style, stage);
  const fx0 = foot.min.x, fx1 = foot.max.x, fz0 = foot.min.z, fz1 = foot.max.z;
  if (stage === 1 || stage === 2) {
    // a pile at the foot of the damaged corner
    const px = clamp(cx0 + corner[0] * (tw / 2 + 0.04), -lim.x + 0.1, lim.x - 0.1), pz = clamp(cz0 + corner[1] * (td / 2 + 0.04), -lim.z + 0.1, lim.z - 0.1);
    const rad = stage === 1 ? 0.13 : clamp(0.16 + th * 0.04, 0.18, 0.4);
    pile(px, pz, rad, rad, stage === 1 ? 0.035 : clamp(0.05 + th * 0.012, 0.06, 0.16), stage === 1 ? 14 : 34, colours, 0.8);
    if (stage === 2) groundScorch(px, pz, rad * 1.5);
  }
  if (stage === 3) {
    // the heap: the building's footprint, a little spread out, as high as the building had mass
    const hx = (fx0 + fx1) / 2, hz = (fz0 + fz1) / 2;
    const rx = Math.min((fx1 - fx0) / 2 * 1.08 + 0.04, lim.x - Math.abs(hx)), rz = Math.min((fz1 - fz0) / 2 * 1.08 + 0.04, lim.z - Math.abs(hz));
    const peak = clamp(0.06 + Hs * 0.22, 0.1, 1.1);
    groundScorch(hx, hz, Math.max(rx, rz) * 1.3);
    heapCore(hx, hz, rx, rz, peak, colours);
    const area = rx * rz * 4;
    pile(hx, hz, rx, rz, peak, clamp(Math.round(40 + area * 55 + peak * 90), 36, 240), colours, 1);
    // embers in the heap and a few small fires
    const em = EMBERS(), ne = clamp(Math.round(10 + area * 16), 10, 60);
    for (let i = 0; i < ne; i++) {
      const [x, z, hgt] = onHeap(hx, hz, rx * 0.85, rz * 0.85, peak);
      const s = R.range(0.016, 0.032) * (1 + peak);
      const e = new THREE.Mesh(boxGeo(s, s * 0.6, s), em[i % em.length]); e.position.set(x, hgt + R.range(0.006, 0.03) * (1 + peak), z); e.rotation.set(R() * 3, R() * 3, R() * 3);
      addRoot(e, true);
    }
    for (let i = 0; i < R.int(1, 3); i++) { const [x, z, hgt] = onHeap(hx, hz, rx * 0.6, rz * 0.6, peak); flames(root, new THREE.Matrix4(), x, hgt - 0.01, z, 0.12 + peak * 0.1, 0.55); }
  }

  function onHeap(hx, hz, rx, rz, peak) {
    const a = R() * Math.PI * 2, rr = Math.sqrt(R());
    const x = hx + Math.cos(a) * rx * rr, z = hz + Math.sin(a) * rz * rr;
    return [x, z, peak * Math.pow(Math.max(0, 1 - rr * rr), 0.75)];
  }
  function pile(hx, hz, rx, rz, peak, n, cols, k) {
    const big = clamp(peak / 0.3, 0.6, 2.4);
    for (let i = 0; i < n; i++) {
      const [x0, z0, hgt] = onHeap(hx, hz, rx, rz, peak);
      const kind = R();
      let w, h, d, mat;
      if (kind < 0.5) { w = R.range(0.02, 0.06) * big; h = w * R.range(0.5, 1); d = w * R.range(0.7, 1.4); mat = rubbleMat(R.pick(cols)); }
      else if (kind < 0.78) { w = R.range(0.06, 0.16) * big; h = R.range(0.012, 0.02) * Math.min(big, 1.4); d = w * R.range(0.5, 1); mat = rubbleMat(R.pick(cols)); }
      else if (kind < 0.93) { w = R.range(0.1, 0.26) * Math.min(big, 1.6); h = 0.014 * Math.min(big, 1.5); d = h; mat = rubbleMat(cols[cols.length - 1]); }
      else { w = R.range(0.05, 0.12); h = 0.005; d = 0.005; mat = steelMat(); }
      const pc = new THREE.Mesh(boxGeo(w, h, d), mat);
      const hd = 0.5 * Math.hypot(w, h, d);
      const x = clamp(x0, -lim.x + hd, lim.x - hd), z = clamp(z0, -lim.z + hd, lim.z - hd);
      if (Math.abs(x) > lim.x - hd + 1e-6 || Math.abs(z) > lim.z - hd + 1e-6) continue;   // too big to fit here
      pc.position.set(x, Math.max(0.028 + h / 2, hgt * R.range(0.6, 1) * k), z);
      pc.rotation.set(R.range(-0.7, 0.7), R() * Math.PI * 2, R.range(-0.7, 0.7));
      addRoot(pc);
    }
  }
  function heapCore(hx, hz, rx, rz, peak, cols) {
    const lumps = [[hx, hz, rx, rz, peak, 0]];
    for (let i = 0; i < 5; i++) { const [x, z] = onHeap(hx, hz, rx * 0.7, rz * 0.7, peak); lumps.push([x, z, rx * R.range(0.3, 0.5), rz * R.range(0.3, 0.5), peak * R.range(0.4, 0.75), i + 1]); }
    for (const [x, z, sx0, sz0, sy, i] of lumps) {
      const sx = Math.min(sx0, lim.x - Math.abs(x)), sz = Math.min(sz0, lim.z - Math.abs(z));
      if (sx < 0.02 || sz < 0.02) continue;
      const m = new THREE.Mesh(lumpGeo(seed * 13 + i), rubbleMat(cols[(i + 1) % cols.length]));
      m.scale.set(sx, sy, sz); m.position.set(x, 0.02, z);   // not turned: the scale was fitted to the lot
      if (i > 0) m.position.y = 0.02 + peak * 0.15;
      m.scale.x = Math.min(sx, (lim.x - Math.abs(x)) / 1.12); m.scale.z = Math.min(sz, (lim.z - Math.abs(z)) / 1.12);
      addRoot(m);
    }
  }
  function groundScorch(x, z, r) {
    r = Math.min(r, lim.x - Math.abs(x), lim.z - Math.abs(z)); if (r < 0.05) return;
    const pl = new THREE.Mesh(planeGeo(r * 2, r * 2), decalMat('scorch', 1));
    pl.rotation.x = -Math.PI / 2; pl.position.set(x, 0.027, z); pl.renderOrder = 1; pl.receiveShadow = true;
    addRoot(pl, false, true);
  }
  function addRoot(mesh, glow = false, flat = false) {
    mesh.castShadow = !glow && !flat; mesh.receiveShadow = true;
    root.add(mesh); mesh.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(mesh, true).applyMatrix4(inv);
    if (bb.max.x > lim.x || bb.min.x < -lim.x || bb.max.z > lim.z || bb.min.z < -lim.z) root.remove(mesh); else added.push(mesh);
  }

  root.userData.damage = stage;
  return root;
}

// ---------------------------------------------------------------- geometry
const geoCache = new Map();
const G = (k, make) => { if (!geoCache.has(k)) geoCache.set(k, make()); return geoCache.get(k); };
const f3 = n => n.toFixed(3);
const boxGeo = (w, h, d) => G(`b${f3(w)}:${f3(h)}:${f3(d)}`, () => new THREE.BoxGeometry(w, h, d));
const cylGeo = (rt, rb, h, seg) => G(`c${f3(rt)}:${f3(rb)}:${f3(h)}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const puffGeo = () => G('puff', () => new THREE.IcosahedronGeometry(1, 1));
const planeGeo = (w, h) => G(`p${f3(w)}:${f3(h)}`, () => new THREE.PlaneGeometry(w, h));
/** A lumpy half-ball of radius 1 (bottom flat at y=0): the core of a rubble heap. */
function lumpGeo(seed) {
  return G(`lump${seed % 16}`, () => {
    const R = rng(seed % 16 + 101);
    const g = new THREE.IcosahedronGeometry(1, 2).toNonIndexed();
    const p = g.attributes.position, seen = new Map();
    for (let i = 0; i < p.count; i++) {
      const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!seen.has(k)) seen.set(k, R.range(0.78, 1.08));
      const s = seen.get(k), y = p.getY(i);
      p.setXYZ(i, p.getX(i) * s, Math.max(0, y) * s * 0.9, p.getZ(i) * s);
      // keep it inside the unit circle so the lot fit holds
      const r = Math.hypot(p.getX(i), p.getZ(i)); if (r > 1.1) p.setXYZ(i, p.getX(i) / r * 1.1, p.getY(i), p.getZ(i) / r * 1.1);
    }
    g.computeVertexNormals(); return g;
  });
}

/**
 * Part of a box: cut [x0,x1]×[y0,y1]×[z0,z1] (in the box's own space) out of mesh m. Faces that were on the outside
 * keep their material with the texture mapped exactly where it was (same windows); new inside faces show bare floors.
 */
function subBox(m, maps, mats, [x0, x1, y0, y1, z0, z1], [W, H, D], rowH) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const pos = g.attributes.position, uv = g.attributes.uv;
  const ext = [[x0, x1, W], [y0, y1, H], [z0, z1, D]];
  const out = [];
  for (let f = 0; f < 6; f++) {
    const [ax, sg] = FACE_AXIS[f];
    const [lo, hi, full] = ext[ax];
    const outer = sg > 0 ? Math.abs(hi - full / 2) < 1e-6 : Math.abs(lo + full / 2) < 1e-6;
    const mp = maps[f];
    for (let i = f * 4; i < f * 4 + 4; i++) {
      const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
      if (outer) uv.setXY(i, mp.u0 + (p[mp.au] - mp.pu) * mp.su, mp.v0 + (p[mp.av] - mp.pv) * mp.sv);
      else if (ax === 1) uv.setXY(i, p[0] / 0.2, p[2] / 0.2);
      else uv.setXY(i, (ax === 0 ? p[2] : p[0]) / (FLOOR * 1.3), (p[1] + H / 2) / rowH);   // one floor per texture row
    }
    out.push(outer ? mats[f] : ax === 1 ? floorMat() : interiorMat());
  }
  uv.needsUpdate = true;
  const piece = new THREE.Mesh(g, out);
  piece.position.copy(m.position); piece.quaternion.copy(m.quaternion); piece.scale.copy(m.scale);
  piece.castShadow = m.castShadow; piece.receiveShadow = m.receiveShadow; piece.renderOrder = m.renderOrder;
  piece.userData.wreckPiece = true;
  return piece;
}

function shuffle(a, R) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

function rubbleColours(style, stage) {
  const st = STYLES[style] || STYLES.chrome;
  // the building's own colours, dulled by dust and soot, plus bare concrete; the last one is for beams
  const dust = new THREE.Color('#6d655b');
  const c = [...st.body.map(h => '#' + new THREE.Color(h).lerp(dust, 0.62).getHexString()), '#7a756e', '#66615a', '#57524b', st.trim];
  return c.map(h => '#' + new THREE.Color(h).lerp(SOOT, stage === 3 ? 0.42 : 0.25).getHexString());
}
