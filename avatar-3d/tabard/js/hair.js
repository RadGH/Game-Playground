// Tabard hair layer (round 4, 2026-11-23). Its own mesh on the Head bone, built for THIS body's real head, with
// see-through strand edges, any colour, and swinging tails. Styles = the 25 Chibi 2.6 ids, tuned in data/hair.json.
//
//   createHair(ctx) → { set({id, color} | null), setHead(headItemId | null), update(dt), dispose(), ... }
//   ctx = { THREE, D, body, bones, root, group, bodyMesh, geosets, at }   (js/tabard.js passes it)
//
// HOW A HAIRDO IS BUILT
//   1. The head is measured once per body: from a point inside the skull, rays every 5° (up/down × around) find how
//      far the skin is (the body mesh + any face mesh, triangles the Head bone moves). That gives the scalp R(dir):
//      every hair point is asked of it, so hair hugs the man's and the woman's head alike and never sinks in.
//   2. A style (data/hair.json) is a list of pieces in head angles (θ from straight up, φ round from the face toward
//      the character's left, both in degrees; lengths in metres on a ~20 cm wide head, scaled to the head):
//        cap    a shell over the scalp down to a hairline (6 knots: front, temple, sideburn, ear, behind ear, nape),
//               its last band = ragged see-through tips; `lift` = volume (crown, front, side, back); `part`, `noise`
//        locks  painted strand cards that flow over the scalp then fall (fringe, side locks, swept tops)
//        spikes crossed tuft cards pointing out/up (spiky, mohawk, messy)
//        knot   a bun / top knot with a leather tie
//        fins   short curl fins standing off a curly cap (the fuzzy outline of curls)
//        tail   a SWINGING chain: ponytail, braid, loc, twin tails (core tube + crossed see-through cards)
//        sheet  a SWINGING curtain: long hair down the back (a small cloth pinned along the scalp)
//      Each piece may say `hat: 'drop'` (gone under a hat: buns, spikes, crown tails) or `hat: 'only'` (the tucked
//      alternative that appears only under a hat, e.g. a high ponytail becomes a low one).
//   3. All of it is ONE mesh, ONE material per colour (one shared 1024² texture painted in code, js/hair-paint.js):
//      one draw call. Swinging parts are rewritten on the CPU each frame from the physics points (js/cloth.js Verlet).
//
// HEADWEAR (data/items.json head items, `hair`: 'hide' | 'under' | 'keep'; old `hidesHair: true` = 'hide')
//   'under': the hat's model is measured the same way as the scalp (rays from inside the skull to the hat's inner
//   surface); every hair point the hat covers is pressed 4 mm inside it (never below the scalp), crown pieces drop,
//   'only' pieces appear, tails below the rim still swing. tests/qa-hair.mjs checks every style × head item × body.
import { hairCanvas, REGIONS, SIZE } from './hair-paint.js';
import { Verlet, bodyColliders } from './cloth.js';

const DEG = Math.PI / 180, TAU = Math.PI * 2;
const NT = 37, NP = 72;                       // scalp grid: θ 0..180 step 5°, φ -180..175 step 5°
let STYLES = null;
const shapeCache = new Map(), hatCache = new Map(), MATS = new Map();
let TEX = null, loaderP = null;

/** The style table (data/hair.json), loaded once. */
export async function hairStyles(at) {
  if (!STYLES) STYLES = fetch(at('data/hair.json')).then(r => r.json());
  return STYLES;
}

// ------------------------------------------------------------------------------------------------ geometry helpers
function rayTri(o, d, a, b, c) {   // Möller–Trumbore, returns t or -1 (both faces)
  const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2], e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
  const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) return -1;
  const inv = 1 / det, tx = o[0] - a[0], ty = o[1] - a[1], tz = o[2] - a[2];
  const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (v < 0 || u + v > 1) return -1;
  return (e2x * qx + e2y * qy + e2z * qz) * inv;
}
const dirOf = (th, ph) => [Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph)];
/** A radial grid: for each direction from the origin, the farthest (or nearest) hit on the triangles. */
function radialGrid(tris, far) {
  const g = new Float32Array(NT * NP).fill(NaN), o = [0, 0, 0];
  for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) {
    const d = dirOf(i * 5 * DEG, (j * 5 - 180) * DEG); let best = far ? -1 : Infinity;
    for (let k = 0; k < tris.length; k += 9) {
      const t = rayTri(o, d, tris.subarray(k, k + 3), tris.subarray(k + 3, k + 6), tris.subarray(k + 6, k + 9));
      if (t > 0) best = far ? Math.max(best, t) : Math.min(best, t);
    }
    if (far ? best > 0 : best < Infinity) g[i * NP + j] = best;
  }
  return g;
}
/** The hat's nearest surface: the smallest of the 4 grid corners round the direction (a brim changes fast between
 *  grid points; smoothing between them let tails through it). NaN where the hat does not cover. */
function lookupMin(g, x, y, z) {
  const r = Math.hypot(x, y, z) || 1e-9;
  const th = Math.acos(Math.max(-1, Math.min(1, y / r))) / DEG / 5, ph = (Math.atan2(x, z) / DEG + 180) / 5;
  const i0 = Math.min(NT - 2, Math.floor(th)), j0 = Math.floor(ph) % NP, j1 = (j0 + 1) % NP;
  let m = Infinity; for (const v of [g[i0 * NP + j0], g[i0 * NP + j1], g[(i0 + 1) * NP + j0], g[(i0 + 1) * NP + j1]]) if (v === v && v < m) m = v;
  return m === Infinity ? NaN : m;
}
function lookup(g, x, y, z) {   // bilinear in (θ, φ), wraps round in φ; NaN where the grid has none
  const r = Math.hypot(x, y, z) || 1e-9;
  const th = Math.acos(Math.max(-1, Math.min(1, y / r))) / DEG / 5, ph = (Math.atan2(x, z) / DEG + 180) / 5;
  const i0 = Math.min(NT - 2, Math.floor(th)), fi = Math.min(1, th - i0), j0 = Math.floor(ph) % NP, fj = ph - Math.floor(ph), j1 = (j0 + 1) % NP;
  const a = g[i0 * NP + j0], b = g[i0 * NP + j1], c = g[(i0 + 1) * NP + j0], d = g[(i0 + 1) * NP + j1];
  if (a !== a || b !== b || c !== c || d !== d) {       // an edge of the covered area: the nearest known surface
    let m = Infinity; for (const x of [a, b, c, d]) if (x === x && x < m) m = x; return m === Infinity ? NaN : m;
  }
  return (a * (1 - fj) + b * fj) * (1 - fi) + (c * (1 - fj) + d * fj) * fi;
}

/**
 * The head of this body: origin C (inside the skull) in bind space, the matrix from head space (bind axes, origin C)
 * to the Head bone's own frame, the scalp grid R and an outer grid (ears smoothed over, for hair that covers them).
 */
function headShape(ctx) {
  const { THREE, root, bodyMesh } = ctx;
  const key = bodyMesh.geometry.uuid;
  if (shapeCache.has(key)) return shapeCache.get(key);
  const sk = bodyMesh.skeleton, hi = sk.bones.findIndex(b => b.name === 'Head');
  const meshes = []; root.traverse(o => { if (o.isSkinnedMesh && !o.name.startsWith('geo_') && o.skeleton) meshes.push(o); });
  const tri = [], ntri = [];
  const v = new THREE.Vector3();
  let mn = [9, 9, 9], mx = [-9, -9, -9];
  for (const m of meshes) {
    const g = m.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const mhi = m.skeleton.bones.findIndex(b => b.name === 'Head'), mni = m.skeleton.bones.findIndex(b => b.name === 'neck_01');
    const w = new Float32Array(pos.count), wn = new Float32Array(pos.count), P = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      let wh = 0;
      for (let k = 0; k < 4; k++) { const j = si.getComponent(i, k); if (j === mhi) wh += sw.getComponent(i, k); if (j === mni) wn[i] += sw.getComponent(i, k); }
      w[i] = wh;
      v.fromBufferAttribute(pos, i).applyMatrix4(m.bindMatrix); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
      if (wh > 0.5) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], P[i * 3 + c]); mx[c] = Math.max(mx[c], P[i * 3 + c]); }
    }
    const idx = g.index ? g.index.array : [...Array(pos.count).keys()];
    for (let k = 0; k < idx.length; k += 3) {
      const a = idx[k], b = idx[k + 1], c = idx[k + 2];
      const into = Math.max(w[a], w[b], w[c]) >= 0.35 ? tri : Math.max(wn[a], wn[b], wn[c]) >= 0.35 ? ntri : null;
      if (into) for (const q of [a, b, c]) into.push(P[q * 3], P[q * 3 + 1], P[q * 3 + 2]);
    }
  }
  const R0 = (mx[0] - mn[0]) / 2, C = [(mn[0] + mx[0]) / 2, mx[1] - 1.05 * R0, (mn[2] + mx[2]) / 2 - 0.1 * R0];
  const local = a => { const T = new Float32Array(a.length); for (let i = 0; i < a.length; i++) T[i] = a[i] - C[i % 3]; return T; };
  // the skull: its farthest skin along each ray; where the head has none (under the skull), the NEAREST neck skin
  // (the farthest would be the shoulders, 20 cm out — a nape hairline flared onto them, 2026-11-23)
  const raw = radialGrid(local(tri), true), neck = radialGrid(local(ntri), false);
  for (let i = 0; i < raw.length; i++) if (raw[i] !== raw[i]) raw[i] = neck[i];
  // below the skull (θ ≥ 120°) the first skin out from the middle is the neck: long nape triangles reach the back
  const near = radialGrid(local(tri.concat(ntri)), false);
  for (let i = 24 * NP; i < raw.length; i++) if (near[i] === near[i] && !(raw[i] <= near[i])) raw[i] = near[i];
  // and rays that pass behind the neck reach the upper back: below the skull the scalp may not grow > 1 cm per 5°
  for (let i = 24; i < NT; i++) for (let j = 0; j < NP; j++) raw[i * NP + j] = Math.min(raw[i * NP + j], raw[(i - 1) * NP + j] + 0.01);
  // fill misses (the neck opening) from the row above, then smooth: never inside the skin (max with a blur)
  for (let i = 1; i < NT; i++) for (let j = 0; j < NP; j++) if (raw[i * NP + j] !== raw[i * NP + j]) raw[i * NP + j] = raw[(i - 1) * NP + j];
  const blur = (g, rad) => {
    const o = new Float32Array(g.length);
    for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) {
      let s = 0, n = 0;
      for (let a = -rad; a <= rad; a++) for (let b = -rad; b <= rad; b++) {
        const ii = Math.min(NT - 1, Math.max(0, i + a)), jj = (j + b + NP) % NP; s += g[ii * NP + jj]; n++;
      }
      o[i * NP + j] = s / n;
    }
    return o;
  };
  const b1 = blur(raw, 1), R = new Float32Array(raw.length);
  for (let i = 0; i < R.length; i++) R[i] = Math.max(raw[i], b1[i]);
  const dil = new Float32Array(raw.length);       // outer: the ears smoothed over (max over ±15°, then blurred)
  for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) {
    let m = 0; for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) { const ii = Math.min(NT - 1, Math.max(0, i + a)); if (ii > 23) continue; m = Math.max(m, R[ii * NP + (j + b + NP) % NP]); }
    dil[i * NP + j] = i > 23 ? R[i * NP + j] : Math.max(m, R[i * NP + j]);   // the ears smoothed over; never below 115°
  }
  const Rout = blur(dil, 2); for (let i = 0; i < Rout.length; i++) Rout[i] = Math.max(Rout[i], R[i]);
  // head space -> Head bone frame (mesh bind space through the bone's inverse bind matrix)
  const M = new THREE.Matrix4().copy(sk.boneInverses[hi]).multiply(bodyMesh.bindMatrix).multiply(new THREE.Matrix4().makeTranslation(C[0], C[1], C[2]));
  // the head collider: a sphere inside the back half of the skull
  let s = 0, n = 0; for (let i = 18; i <= 26; i++) for (let j = 0; j < NP; j++) { const ph = j * 5 - 180; if (Math.abs(ph) > 90) { s += R[i * NP + j]; n++; } }
  const out = { C, R0, k: R0 / 0.098, M, Minv: M.clone().invert(), R, Rout, rHead: 0.93 * s / n };
  shapeCache.set(key, out);
  return out;
}

async function gltf(THREE, url) {
  if (!loaderP) loaderP = import('three/addons/loaders/GLTFLoader.js').then(m => new m.GLTFLoader());
  const L = await loaderP; return L.loadAsync(url);
}
/** A head item's inner surface as seen from inside the skull (same grid as the scalp). Cached per body + prop. */
async function hatShape(ctx, shape, propId) {
  const key = ctx.body + '|' + propId;
  if (!hatCache.has(key)) hatCache.set(key, (async () => {
    const { THREE, D } = ctx;
    const sock = D.sockets[ctx.body]?.[propId]?.[0]; if (!sock) return null;
    const g = await gltf(THREE, ctx.at(`models/props/${propId}.glb`));
    g.scene.updateMatrixWorld(true);
    // prop -> Head bone frame: socket matrix · (+90° about X, the Y-up undo tabard.js applies) · node matrix
    const toBone = new THREE.Matrix4().fromArray(sock.matrix).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    const toHead = shape.Minv.clone().multiply(toBone);
    const tri = [], v = new THREE.Vector3();
    g.scene.traverse(m => {
      if (!m.isMesh) return;
      const mm = toHead.clone().multiply(m.matrixWorld), pos = m.geometry.attributes.position;
      const idx = m.geometry.index ? m.geometry.index.array : [...Array(pos.count).keys()];
      for (const i of idx) { v.fromBufferAttribute(pos, i).applyMatrix4(mm); tri.push(v.x, v.y, v.z); }
    });
    const R = radialGrid(Float32Array.from(tri), false);
    // err on the safe side at the hat's edges (a brim, an ear flap is thinner than the 5° grid): grow the covered
    // area by two grid steps (10°), each new cell taking its nearest known neighbour's distance
    for (let pass = 0; pass < 2; pass++) {
      const src = R.slice();
      for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) {
        if (src[i * NP + j] === src[i * NP + j]) continue;
        let m = Infinity;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const ii = i + a; if (ii < 0 || ii >= NT) continue; const x = src[ii * NP + (j + b + NP) % NP]; if (x === x && x < m) m = x; }
        if (m < Infinity) R[i * NP + j] = m;
      }
    }
    // a wider version (2 more steps, 10° more) for the points next to tucked hair and for where tails start: a brim
    // that sits ON the skin (the woman's nape under the tipped-back kettle helm) needs hair to dive further
    const Rw = R.slice();
    for (let pass = 0; pass < 2; pass++) {
      const src = Rw.slice();
      for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) {
        if (src[i * NP + j] === src[i * NP + j]) continue;
        let m = Infinity;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const ii = i + a; if (ii < 0 || ii >= NT) continue; const x = src[ii * NP + (j + b + NP) % NP]; if (x === x && x < m) m = x; }
        if (m < Infinity) Rw[i * NP + j] = m;
      }
    }
    return { R, Rw };
  })());
  return hatCache.get(key);
}

// ------------------------------------------------------------------------------------------------ material
function material(THREE, color) {
  if (!TEX) {
    TEX = new THREE.CanvasTexture(hairCanvas());
    TEX.flipY = false; TEX.colorSpace = THREE.SRGBColorSpace; TEX.anisotropy = 4;
  }
  const key = String(color);
  if (!MATS.has(key)) {
    const m = new THREE.MeshLambertMaterial({ color: new THREE.Color(color), map: TEX, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true });
    m.name = 'tabard-hair';
    m.onBeforeCompile = sh => {
      sh.vertexShader = 'attribute float tint;\nvarying float vTint;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTint = tint;');
      sh.fragmentShader = 'varying float vTint;\n' + sh.fragmentShader
        // the picture is light/shade only: grey 0.5 = the hair colour, darker toward 0 (roots, gaps), lighter toward 1
        .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec4 tx = texture2D( map, vMapUv );
  float sh = pow( tx.r, 0.4545 );
  vec3 base = diffuseColor.rgb;
  vec3 hc = sh < 0.5 ? mix( base * 0.2, base, sh * 2.0 ) : mix( base, mix( base * 1.7 + 0.03, vec3( 1.0 ), 0.12 ), sh * 2.0 - 1.0 );
  diffuseColor.rgb = mix( tx.rgb, hc, vTint );
  diffuseColor.a *= tx.a;
#endif`)
        // hair normals point away from the head on BOTH faces of a card (no dark backs)
        .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    };
    m.customProgramCacheKey = () => 'tabard-hair-1';
    MATS.set(key, m);
  }
  return MATS.get(key);
}

// ------------------------------------------------------------------------------------------------ the builder
/** Writes vertices in head space. Static pieces go to `st`, swinging ones to `dy` (bound to physics chains). */
function makeBuilder() {
  const mk = () => ({ pos: [], nor: [], uv: [], col: [], tint: [], idx: [], bind: [] });
  return { st: mk(), dy: mk() };
}
function vert(b, p, n, uv, ao = 1, alpha = 1, tint = 1) {
  b.pos.push(p[0], p[1], p[2]); b.nor.push(n[0], n[1], n[2]); b.uv.push(uv[0], uv[1]); b.col.push(ao, ao, ao, alpha); b.tint.push(tint);
  return b.pos.length / 3 - 1;
}
const quad = (b, a, c, d, e) => b.idx.push(a, c, d, c, e, d);   // a-c top row, d-e bottom row: (a, c, d) (c, e, d)
const regUV = (reg, u, v) => { const [x, y, w, h] = REGIONS[reg]; return [(x + 0.5 + u * (w - 1)) / SIZE, (y + 0.5 + v * (h - 1)) / SIZE]; };

const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  len: a => Math.hypot(a[0], a[1], a[2]), norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};
const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
function hash(i, j) { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {   // smooth value noise
  const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
  return (hash(xi, yi) * (1 - fx) + hash(xi + 1, yi) * fx) * (1 - fy) + (hash(xi, yi + 1) * (1 - fx) + hash(xi + 1, yi + 1) * fx) * fy;
}

/** Angles/lengths → head-space points on this scalp. */
function makeKit(shape) {
  const k = shape.k;
  const Rs = (p, outer) => lookup(outer ? shape.Rout : shape.R, p[0], p[1], p[2]);
  const S = (thD, phD, lift = 0, outer = false) => { const d = dirOf(thD * DEG, phD * DEG); return V3.mul(d, Rs(d, outer) + lift * k); };
  const sph = p => { const r = V3.len(p); return { r, th: Math.acos(Math.max(-1, Math.min(1, p[1] / r))) / DEG, ph: Math.atan2(p[0], p[2]) / DEG }; };
  const downT = (thD, phD) => { const t = thD * DEG, f = phD * DEG; return [Math.cos(t) * Math.sin(f), -Math.sin(t), Math.cos(t) * Math.cos(f)]; };
  const eastT = phD => [Math.cos(phD * DEG), 0, -Math.sin(phD * DEG)];
  /** keep a point at least `lift` off the scalp */
  const outside = (p, lift, outer) => { const d = V3.norm(p), m = Rs(d, outer) + lift * k; return V3.len(p) < m ? V3.mul(d, m) : p; };
  return { k, Rs, S, sph, downT, eastT, outside };
}

/** The hairline θ (degrees) at bearing φ, from 6 knots at |φ| = 0, 45, 75, 95, 130, 180. */
function hairline(line, skew = 0) {
  const K = [0, 45, 75, 95, 130, 180];
  return phD => {
    let p = Math.abs(((phD + 180) % 360 + 360) % 360 - 180);
    for (let i = 1; i < K.length; i++) if (p <= K[i]) { const u = smooth((p - K[i - 1]) / (K[i] - K[i - 1])); return line[i - 1] + (line[i] - line[i - 1]) * u + skew * Math.sin(phD * DEG); }
    return line[5];
  };
}
/** front / side / back blend of four numbers [crown, front, side, back] at bearing φ (crown handled by the caller). */
function around(v, phD) {
  const c = Math.cos(phD * DEG); return c >= 0 ? v[2] + (v[1] - v[2]) * c * c : v[2] + (v[3] - v[2]) * c * c;
}

// -------------------------------------------------------------------- static pieces
function buildCap(B, K, P) {
  const line0 = hairline(P.line || [56, 64, 92, 76, 118, 145], P.skew || 0), lift = P.lift || [0.008, 0.005, 0.004, 0.005];
  // a hairline is never a ruler line: ±`wobble`° of smooth noise round the head
  const line = ph => line0(ph) + (P.wobble ?? 2.5) * (vnoise((ph + 180) / 11, 3.7) * 2 - 1);
  const cols = P.cols || 24, rows = P.rows || 8, rep = P.rep || 3, tex = P.tex || 'cap', fr = P.fringe ?? 9;
  const tiled = tex === 'cap';                // cap: strands; curl/buzz: tiles, ragged edge by vertex alpha
  const soft = P.edge === 'soft' || !tiled;   // soft: the last band is short fuzz (buzz picture) fading out
  const back = P.flow === 'back';             // combed back: roots (dark) at the hairline, strands run up to the crown
  const per = cols / rep;
  const seamOff = rep % 2 === 0 ? 180 / rep : 0;   // where the picture repeats: never down the middle of the forehead
  const liftAt = (t, ph, th) => {
    let L = around(lift, ph) + (lift[0] - around(lift, ph)) * (1 - t) ** 2;
    L *= 1 - 0.75 * smooth((t - 0.7) / 0.3);
    if (P.part != null) { const dp = ((ph - P.part + 540) % 360) - 180; L *= 1 - 0.8 * Math.exp(-((dp / 9) ** 2)) * (1 - smooth((t - 0.6) / 0.3)); }
    if (P.noise) L += P.noise * (vnoise(th / 14, (ph + 180) / 14) - 0.3) * (1 - smooth((t - 0.75) / 0.25));
    return L;
  };
  const partAO = (ph, t) => { if (P.part == null) return 1; const dp = ((ph - P.part + 540) % 360) - 180; return 1 - 0.45 * Math.exp(-((dp / 6) ** 2)) * (1 - t); };
  /** one grid of panels; at(j, ph) -> [θ, lift, v, alpha, ao] */
  const grid = (nRows, at, region) => {
    for (let r0 = 0; r0 < rep; r0++) {          // panels: each repeat of the picture gets its own vertices (no wrap seam)
      const base = b.pos.length / 3;
      for (let j = 0; j <= nRows; j++) for (let i = 0; i <= per; i++) {
        const ph = -180 + seamOff + 360 * (r0 * per + i) / cols, [th, L, v, alpha, ao] = at(j, ph);
        // + more room low on the head: the neck bends that skin out past the head's own frame
        const p = K.S(th, ph, L + 0.004 + 0.004 * smooth((th - 95) / 30), !!P.outer);   // 4 mm: the posed scalp comes ~3 mm past the bind-pose measure (2026-11-23 buzz holes)
        vert(b, p, V3.norm(p), regUV(region, i / per, v), ao * (P.ao ?? 1), alpha);
      }
      for (let j = 0; j < nRows; j++) for (let i = 0; i < per; i++) {
        const a = base + j * (per + 1) + i; quad(b, a, a + 1, a + per + 1, a + per + 2);
      }
    }
  };
  const b = B.st;
  if (!soft) {       // strands down to the hairline, then a band of ragged tips past it
    // over the forehead the tips stay short (a full band of tips there read as a comb of teeth — owner review
    // 2026-11-23); they grow to full length by the temples, where hair hangs. A soft fuzz band covers the front edge.
    const tipK = ph => { const a = Math.abs(((ph + 540) % 360) - 180); return 0.3 + 0.7 * smooth((a - 35) / 55); };
    grid(rows + 1, (j, ph) => {
      const edge = line(ph), t = Math.min(1, j / rows), th = j <= rows ? edge * t : edge + fr * tipK(ph);
      return [th, j > rows ? 0 : liftAt(t, ph, th), j <= rows ? 0.8 * t : 1, 1, partAO(ph, t) * (j > rows ? 0.85 : 1)];
    }, tex);
    grid(2, (j, ph) => {
      const edge = line(ph), k = 1 - tipK(ph) + 0.3, th = edge - 3 + (fr * 0.55 + 3) * j / 2;
      return [th, 0.0012 * (2 - j), 0.3 + j * 0.3, [1, 0.6, 0.45 * Math.min(1, k)][j], 0.9];
    }, 'buzz');
  } else {
    grid(rows, (j, ph) => {
      const edge = line(ph), t = j / rows, th = edge * t;
      const v = tiled ? (back ? 0.03 + 0.74 * (1 - t) : 0.78 * t) : t * 0.97;
      return [th, liftAt(t, ph, th), v, tiled ? 1 : 1 - 0.25 * smooth((t - 0.9) / 0.1), partAO(ph, t)];
    }, tex);
    // the fuzz band: from just inside the edge to `fringe`° past it, alpha fading to nothing (speckled = ragged)
    grid(2, (j, ph) => {
      const edge = line(ph), th = edge - 2 + (fr + 2) * j / 2;
      return [th, 0.0004 * (2 - j), 0.3 + j * 0.3, [1, 0.62, 0.52][j], 0.9];
    }, 'buzz');
  }
}

/** March a strand over the scalp then let it fall: returns points (head space). */
function march(K, root, dir0, len, segs, { lift = 0.006, hang = 0.5, curl = 0, outer = false, wave = 0, waveDir = null, phase = 0, hug = false }) {
  let p = root, dir = V3.norm(dir0); const pts = [p], step = len * K.k / segs;
  for (let s = 0; s < segs; s++) {
    let q = V3.add(p, V3.mul(dir, step));
    const n = V3.norm(q), before = V3.len(q);
    q = hug ? V3.mul(V3.norm(q), K.Rs(V3.norm(q), outer) + lift * K.k) : K.outside(q, lift, outer);   // hug: lies on the scalp all the way
    const onSkin = hug || V3.len(q) > before + 1e-5;
    if (wave && waveDir) q = V3.add(q, V3.mul(waveDir, Math.sin((s + 1) / segs * Math.PI * 2.5 + phase) * wave * K.k * Math.min(1, (s + 1) / 2)));
    pts.push(q); p = q;
    let nd = V3.add(dir, V3.add(V3.mul([0, -1, 0], hang * 0.5), V3.mul(n, curl * 0.5)));
    if (onSkin) { const o = V3.dot(nd, n); if (o < 0) nd = V3.sub(nd, V3.mul(n, o)); }
    dir = V3.norm(nd);
  }
  return pts;
}

/** A painted card along points: width w(t), 3 across (the middle a little raised). */
function card(b, pts, width, tex, { taper = 0.25, ao = 1, flip = false, bow = 0.18, normalOut = true, uFlip = false } = {}) {
  const n = pts.length, base = b.pos.length / 3;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), p = pts[i];
    const tan = V3.norm(V3.sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
    const out = V3.norm(p);
    let side = V3.norm(V3.cross(out, tan)); if (flip) side = V3.mul(side, -1);
    const up = V3.norm(V3.cross(tan, side));
    const w = width * (1 - (1 - taper) * smooth(t)) / 2;
    const nrm = normalOut ? V3.norm(V3.add(out, V3.mul(up, 0.5))) : up;
    for (let c = 0; c < 3; c++) {
      const x = (c - 1) * w, q = V3.add(V3.add(p, V3.mul(side, x)), V3.mul(up, c === 1 ? w * bow : 0));
      vert(b, q, nrm, regUV(tex, uFlip ? 1 - c / 2 : c / 2, t * 0.98), ao * (0.85 + 0.15 * (1 - t)));
    }
  }
  for (let i = 0; i < n - 1; i++) for (let c = 0; c < 2; c++) { const a = base + i * 3 + c; quad(b, a, a + 1, a + 3, a + 4); }
}

function rootsOf(P) {   // `at`: [[θ, φ], …] or `row`: { from, to, count, theta (number | [a, b]) }
  if (P.at) return P.at;
  const r = P.row, out = [];
  for (let i = 0; i < r.count; i++) {
    const u = r.count === 1 ? 0.5 : i / (r.count - 1), ph = r.from + (r.to - r.from) * u;
    const th = Array.isArray(r.theta) ? r.theta[0] + (r.theta[1] - r.theta[0]) * Math.sin(u * Math.PI) : r.theta;
    out.push([th, ph]);
  }
  return out;
}

function buildLocks(B, K, P) {
  const roots = rootsOf(P), segs = P.segs || 5;
  roots.forEach(([th0, ph], i) => {
    const th = K.below ? Math.max(th0, K.below(th0, ph, P.lift ?? 0.007)) : th0;   // under a hat: from under the rim
    const j = P.jitter ? (hash(i, 7) - 0.5) * P.jitter : 0;
    const swing = (Array.isArray(P.swing) ? P.swing[0] + (P.swing[1] - P.swing[0]) * (roots.length > 1 ? i / (roots.length - 1) : 0.5) : P.swing || 0) + j * 20;
    const root = K.S(th, ph, P.lift ?? 0.007, !!P.outer);
    const d0 = K.downT(th, ph), e0 = K.eastT(ph), sw = swing * DEG;
    const dir = V3.add(V3.mul(d0, Math.cos(sw)), V3.mul(e0, Math.sin(sw)));
    const len = (P.length || 0.06) * (1 + j * 0.3);
    const pts = march(K, root, P.rise ? V3.add(dir, V3.mul(V3.norm(root), P.rise)) : dir, len, segs,
      { lift: (P.lift ?? 0.007) + 0.002, hang: P.hang ?? 0.5, curl: P.curl || 0, outer: !!P.outer, wave: P.wave || 0, waveDir: e0, hug: !!P.hug });
    card(B.st, pts, (P.width || 0.03) * K.k * (1 + j * 0.2), P.tex || 'lock', { taper: P.taper ?? 0.2, ao: P.ao ?? 1, uFlip: i % 2 === 1 });
  });
}

function buildSpikes(B, K, P) {
  const roots = rootsOf(P), segs = 2;
  roots.forEach(([th, ph], i) => {
    const j = (hash(i, 3) - 0.5) * (P.jitter ?? 0.4);
    const root = K.S(th, ph, (P.lift ?? 0.004) - 0.004, !!P.outer), out = V3.norm(root);
    const back = K.downT(th, ph);   // toward the nape/ears, along the scalp
    let dir = V3.norm(V3.add(V3.add(V3.mul(out, 1 - (P.up || 0)), V3.mul([0, 1, 0], P.up || 0)), V3.mul(back, (P.tilt || 0) + j * 0.5)));
    const len = (P.length || 0.05) * K.k * (1 + j * 0.4), w = (P.width || 0.03) * K.k * (1 + j * 0.2);
    const pts = []; for (let s = 0; s <= segs; s++) {
      const t = s / segs; pts.push(V3.add(V3.add(root, V3.mul(dir, len * t)), V3.mul(back, (P.droop || 0) * K.k * t * t)));
    }
    const side = V3.norm(V3.cross(dir, out[1] > 0.95 ? [1, 0, 0] : [0, 1, 0]));
    for (const [sx, nm] of [[side, V3.cross(dir, side)], [V3.norm(V3.cross(dir, side)), side]]) {
      const base = B.st.pos.length / 3;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs, hw = w / 2 * (1 - 0.85 * t), nrm = V3.norm(V3.add(out, V3.mul(dir, 0.3)));
        for (let c = 0; c < 2; c++) vert(B.st, V3.add(pts[s], V3.mul(sx, (c * 2 - 1) * hw)), nrm, regUV(P.tex || 'tuft', c, t * 0.97), (P.ao ?? 1) * (0.8 + 0.2 * t));
      }
      for (let s = 0; s < segs; s++) { const a = base + s * 2; quad(B.st, a, a + 1, a + 2, a + 3); }
      void nm;
    }
  });
}

function buildKnot(B, K, P) {
  const [th0, ph] = P.at, th = K.below ? Math.max(th0, K.below(th0, ph, 0.03, (P.size || [0.05])[0] * K.k)) : th0, size = (P.size || [0.05, 0.045, 0.05]).map(x => x * K.k);
  const root = K.S(th, ph, 0), out = V3.norm(root), east = K.eastT(ph), up = V3.norm(V3.cross(out, east));
  const c = V3.add(root, V3.mul(out, size[1] * 0.75 + (P.lift || 0) * K.k));
  const b = B.st, base = b.pos.length / 3, NU = 10, NV = 7;
  for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
    const v = j / NV, u = i / NU, a = u * TAU, e = (v - 0.5) * Math.PI;
    const lump = 1 + 0.08 * Math.sin(a * 3 + v * 4);
    const local = [Math.cos(e) * Math.cos(a) * size[0] * lump, Math.sin(-e) * size[1], Math.cos(e) * Math.sin(a) * size[2] * lump];
    // local x = east, y = out (away from the head), z = up the head
    const p = V3.add(c, V3.add(V3.add(V3.mul(east, local[0]), V3.mul(out, -local[1])), V3.mul(up, local[2])));
    const n = V3.norm(V3.sub(p, c));
    vert(b, p, n, regUV('cap', u, 0.05 + 0.7 * v), 0.75 + 0.25 * Math.cos(e));
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = base + j * (NU + 1) + i; quad(b, a, a + 1, a + NU + 1, a + NU + 2); }
  if (P.tie !== false) ring(b, V3.add(root, V3.mul(out, size[1] * 0.18)), out, east, size[0] * 0.55, size[1] * 0.32);
}

/** A short leather band (not tinted) round an axis. */
function ring(b, c, axis, side, r, h) {
  const up = V3.norm(V3.cross(axis, side)), base = b.pos.length / 3, N = 8;
  for (let j = 0; j < 2; j++) for (let i = 0; i <= N; i++) {
    const a = i / N * TAU, d = V3.add(V3.mul(side, Math.cos(a)), V3.mul(up, Math.sin(a)));
    vert(b, V3.add(V3.add(c, V3.mul(axis, (j - 0.5) * h)), V3.mul(d, r)), d, regUV('tie', i / N, j), 1, 1, 0);
  }
  for (let i = 0; i < N; i++) quad(b, base + i, base + i + 1, base + N + 1 + i, base + N + 2 + i);
}

function buildFins(B, K, P) {
  const b = B.st, line = P.line ? hairline(P.line) : null;
  for (const th of P.rings) {
    const n = Math.max(4, Math.round((P.count || 14) * Math.sin(th * DEG)));
    for (let i = 0; i < n; i++) {
      const ph = -180 + 360 * (i + (hash(th, i) - 0.5) * 0.4) / n + (th % 10);
      if (line && th > line(ph) - (P.inset ?? 10)) continue;          // never on the face / below the hairline
      const p0 = K.S(th, ph, (P.lift || 0.03) - 0.012, !!P.outer), out = V3.norm(p0), tan = K.downT(th, ph);
      const h = (P.height || 0.025) * K.k * (0.8 + hash(i, th) * 0.4), w = (P.width || 0.05) * K.k / 2;
      const base = b.pos.length / 3, east = V3.norm(V3.cross(out, tan));
      // a fin stands out of the shell, square to it, along the meridian (it shows on the outline)
      for (let j = 0; j < 2; j++) for (let c = 0; c < 2; c++) {
        const q = V3.add(V3.add(p0, V3.mul(tan, (c * 2 - 1) * w)), V3.mul(out, j * h));
        vert(b, q, out, regUV('fin', c * 0.5 + (i % 2) * 0.5, 1 - j * 0.98), 0.9);
      }
      quad(b, base + 2, base + 3, base, base + 1);
      // and one across (so it reads from the front too)
      const base2 = b.pos.length / 3;
      for (let j = 0; j < 2; j++) for (let c = 0; c < 2; c++) {
        const q = V3.add(V3.add(p0, V3.mul(east, (c * 2 - 1) * w * 0.8)), V3.mul(out, j * h * 0.9));
        vert(b, q, out, regUV('fin', c * 0.5, 1 - j * 0.98), 0.9);
      }
      quad(b, base2 + 2, base2 + 3, base2, base2 + 1);
    }
  }
}

/** A static curtain of strands (cap picture: solid, then pointed clump tips): straight-cut bangs, a bob's fringe. */
function buildFringe(B, K, P) {
  const [pa, pb] = P.span || [-60, 60], cols = P.cols || 9, rows = P.rows || 4, b = B.st, per = P.per || 4;
  const cols3 = [];
  for (let c = 0; c < cols; c++) {
    const u = c / (cols - 1), ph = pa + (pb - pa) * u, top0 = Array.isArray(P.top) ? P.top[0] + (P.top[1] - P.top[0]) * Math.sin(u * Math.PI) : (P.top || 45);
    const top = K.below ? Math.max(top0, K.below(top0, ph, P.lift ?? 0.01)) : top0;   // bangs peek out under a brim
    const len = (P.length || 0.07) * (1 + (P.jag || 0.15) * (hash(c, 11) - 0.5) * 2);
    const sw = (P.swing || 0) * DEG, dir = V3.add(V3.mul(K.downT(top, ph), Math.cos(sw)), V3.mul(K.eastT(ph), Math.sin(sw)));
    cols3.push(march(K, K.S(top, ph, P.lift ?? 0.01, !!P.outer), dir, len, rows, { lift: (P.lift ?? 0.01) + 0.002, hang: P.hang ?? 0.2, outer: !!P.outer, curl: P.curl || 0 }));
  }
  for (let c0 = 0; c0 < cols - 1; c0 += per) {
    const c1 = Math.min(cols - 1, c0 + per), w = c1 - c0 + 1, base = b.pos.length / 3;
    for (let r = 0; r <= rows; r++) for (let c = c0; c <= c1; c++) {
      const p = cols3[c][r], t = r / rows;
      vert(b, p, V3.norm(p), regUV(P.tex || 'cap', (c - c0) / per, 0.35 + 0.65 * t), (P.ao ?? 1) * (0.8 + 0.2 * (1 - t)));
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c + 1 < w; c++) { const a = base + r * w + c; quad(b, a, a + 1, a + w, a + w + 1); }
  }
}

// -------------------------------------------------------------------- swinging pieces (bound to physics chains)
// A chain = physics points (rest positions in head space, pinned count, pull per point). A dynamic vertex =
// (chain, f along it, a along the chain's side, b along its normal, normal mix) — rewritten each frame.
function addChain(Ph, rest, { pinned = 2, pull = [0.3, 0.01], rad = 0.012, kind = 'tail', side0 = [1, 0, 0], bend = 0.4 }) {
  const first = Ph.rest.length, ids = [];
  rest.forEach((p, i) => {
    ids.push(Ph.rest.length); Ph.rest.push(p);
    const t = Math.max(0, (i - pinned + 1) / Math.max(1, rest.length - pinned));
    Ph.pin.push(i < pinned ? 1 : 0); Ph.pull.push(pull[0] + (pull[1] - pull[0]) * Math.pow(t, 0.6)); Ph.rad.push(rad);
    if (i > 0) Ph.links.push([first + i - 1, first + i, 1]);
    if (i > 1) Ph.links.push([first + i - 2, first + i, bend]);
  });
  Ph.chains.push({ ids, kind, side0 });
  return Ph.chains.length - 1;
}
function dvert(b, chain, f, a, bb, na, nb, uv, ao = 1, tint = 1) {
  b.bind.push(chain, f, a, bb, na, nb);
  return vert(b, [0, 0, 0], [0, 1, 0], uv, ao, 1, tint);
}

function buildTail(B, K, P, Ph, shape) {
  for (const [th0, ph] of rootsOf(P)) {
    const th = K.below ? Math.max(th0, K.below(th0, ph, P.lift ?? 0.01, (P.width || 0.05) * 0.5 * K.k)) : th0;   // under a hat: out from under the rim, tie and all
    const segs = P.segs || 8, len = (P.length || 0.3) * K.k * (th > th0 ? Math.max(0.5, 1 - (th - th0) / 120) : 1), seg = len / segs;
    const lift = P.lift ?? 0.01, root = K.S(th, ph, lift, !!P.outer), out = V3.norm(root);
    let dir = V3.norm(P.dir ? V3.add(V3.mul(P.dir, 1), V3.mul(out, 0.2)) : V3.add(V3.mul(out, 0.55), [0, -1, 0]));
    if (P.mirror && ph < 0) dir = [-dir[0], dir[1], dir[2]];
    const rest = [root]; let p = root;
    const w0 = (P.width || 0.05) * K.k;
    for (let i = 1; i <= segs; i++) {
      p = V3.add(p, V3.mul(dir, seg));
      p = K.outside(p, lift + w0 * 0.25, true);
      rest.push(p);
      dir = V3.norm(V3.add(dir, V3.mul([0, -1, 0], P.droop ?? 0.35)));
    }
    const side0 = V3.norm(V3.cross([0, 1, 0], out).map((x, i) => x || [1, 0, 0][i]));
    const ci = addChain(Ph, rest, { pinned: 2, pull: P.pull || [0.008, 0.0004], rad: w0 * 0.35, side0, bend: P.bend ?? 0.4 });
    const kind = P.style || 'tail', b = B.dy, n = rest.length - 1, steps = n * 2;
    const prof = t => kind === 'braid' ? 0.75 - 0.25 * t : kind === 'loc' ? 1 - 0.3 * t
      : (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, 0.12 + t * 1.25)) ** 0.6) * (1 - 0.85 * smooth((t - 0.6) / 0.4));
    const flat = kind === 'braid' ? 0.55 : kind === 'loc' ? 0.9 : 0.7;
    // core: a 4-sided tube (5 verts a ring: the seam doubles)
    const sides = kind === 'loc' ? 3 : 4, coreTex = kind === 'braid' ? 'braid' : kind === 'loc' ? 'loc' : 'cap';
    const base = b.pos.length / 3;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, f = t * n, r = w0 / 2 * prof(t) * (kind === 'tail' ? 0.8 : 1);
      for (let i = 0; i <= sides; i++) {
        const a = i / sides * TAU + Math.PI / sides, ca = Math.cos(a), sa = Math.sin(a);
        const v = coreTex === 'cap' ? 0.05 + 0.72 * t : t * 0.96;
        dvert(b, ci, f, ca * r, sa * r * flat, ca, sa, regUV(coreTex, coreTex === 'cap' ? i / sides : 0.15 + 0.7 * Math.abs(i / sides * 2 - 1), v), 0.8 + 0.2 * Math.max(0, sa));
      }
    }
    for (let s = 0; s < steps; s++) for (let i = 0; i < sides; i++) { const a = base + s * (sides + 1) + i; quad(b, a, a + 1, a + sides + 1, a + sides + 2); }
    // crossed see-through cards for a soft outline (not on locs)
    if (kind !== 'loc') for (const [pa, pb] of kind === 'braid' ? [[1, 0], [0, 1]] : [[1, 0], [0.5, 0.866], [-0.5, 0.866]]) {
      const cb = b.pos.length / 3, tex = kind === 'braid' ? 'braid' : 'lock';
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, f = t * n, hw = w0 / 2 * (kind === 'braid' ? prof(t) * 1.25 : 1.05 * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, 0.15 + t))));
        for (let c = 0; c < 2; c++) {
          const x = (c * 2 - 1) * hw;
          dvert(b, ci, f, pa * x, pb * x * (kind === 'braid' ? 0.6 : 0.85), 0.35 * pa, 0.94, regUV(tex, c, t * 0.99), 0.9);
        }
      }
      for (let s = 0; s < steps; s++) { const a = cb + s * 2; quad(b, a, a + 1, a + 2, a + 3); }
    }
    if (P.tie !== false) ring(B.st, V3.add(root, V3.mul(dir, 0)), V3.norm(V3.sub(rest[1], rest[0])), side0, w0 * 0.3, w0 * 0.28);
    void shape;
  }
}

function buildSheet(B, K, P, Ph) {
  const [pa, pb] = P.span || [100, 260], cols = P.cols || 11, rows = P.rows || 8, top = P.top || 70;
  const len = (P.length || 0.3), lift = P.lift ?? 0.01, b = B.dy, inner = P.inner ?? 0.008;
  const first = Ph.chains.length;
  for (let c = 0; c < cols; c++) {
    const ph = pa + (pb - pa) * c / (cols - 1), phN = ((ph + 180) % 360 + 360) % 360 - 180;
    const edge = Math.min(1, Math.min(c, cols - 1 - c) / 1.5);
    const th0 = top + (P.topSides || 0) * (1 - Math.abs(Math.cos(phN * DEG)));
    const th = K.below ? Math.max(th0, K.below(th0, phN, lift, 0.015 * K.k)) : th0;   // under a hat: hangs from below the rim
    const root = K.S(th, phN, lift, true);
    const pts = march(K, root, K.downT(th, phN), len * (P.taper ? 1 - P.taper * (1 - edge) : 1) * Math.max(0.45, 1 - (th - th0) / 110), rows - 1,
      { lift: lift + 0.002, hang: P.hang ?? 0.9, outer: true, curl: P.flare || 0, wave: P.wave || 0, waveDir: V3.norm([root[0], 0, root[2]]), phase: c * 1.7 });
    let pinned = 0; for (const p of pts) { if (K.sph(p).th < (P.pinTheta || 100) && pinned < rows - 2) pinned++; else break; }
    addChain(Ph, pts, { pinned: Math.max(1, pinned), pull: P.pull || [0.2, 0.01], rad: 0.012 * K.k, kind: 'col', side0: K.eastT(phN), bend: 0.3 });
  }
  // neighbours in a row hold together (a curtain, not loose strings)
  for (let c = 0; c + 1 < cols; c++) {
    const A = Ph.chains[first + c].ids, Bc = Ph.chains[first + c + 1].ids;
    for (let r = 0; r < rows; r++) Ph.links.push([A[r], Bc[r], 0.6]);
  }
  for (let c = 0; c < cols; c++) Ph.chains[first + c].sheet = { first, cols, c };
  // mesh: outer + inner layer, 2 sub-rows per physics row (smooth bends); the picture repeats every `per` columns
  // (each repeat has its own column of vertices at the seam, so the strands never squeeze backwards)
  const per = P.per || 4, panels = Math.ceil((cols - 1) / per);
  for (const [off, ao] of [[0, 1], [-inner, 0.62]]) {
    if (off && !inner) continue;
    const sub = 2, R = (rows - 1) * sub;
    for (let pn = 0; pn < panels; pn++) {
      const c0 = pn * per, c1 = Math.min(cols - 1, c0 + per), w = c1 - c0 + 1, base = b.pos.length / 3;
      for (let s = 0; s <= R; s++) for (let c = c0; c <= c1; c++) {
        const t = s / R;
        dvert(b, first + c, s / sub, 0, off * K.k, 0, 1, regUV(P.tex || 'cap', (c - c0) / per, 0.06 + 0.94 * t), ao * (0.72 + 0.28 * (1 - t)));
      }
      for (let s = 0; s < R; s++) for (let c = 0; c + 1 < w; c++) { const a = base + s * w + c; quad(b, a, a + 1, a + w, a + w + 1); }
    }
  }
}

const BUILD = { fringe: buildFringe, cap: buildCap, locks: buildLocks, spikes: buildSpikes, knot: buildKnot, fins: buildFins };

// ------------------------------------------------------------------------------------------------ the layer
export async function createHair(ctx) {
  const { THREE, bones, bodyMesh, group, at } = ctx;
  const S = await hairStyles(at);
  const shape = headShape(ctx);
  const head = bones.Head;
  let mesh = null, cur = null, headId = null, hat = null, version = 0, dyn = null;
  const Mh = shape.M, MhInv = shape.Minv;
  const _w = new THREE.Matrix4(), _l = new THREE.Matrix4(), _v = new THREE.Vector3(), _hm = new THREE.Matrix4();

  function rule(id) {
    const it = id && ctx.D.items.items[id]; if (!it) return 'keep';
    const h = it.hair && typeof it.hair === 'object' ? it.hair[ctx.body] : it.hair;   // may be per body
    return h || (it.hidesHair ? 'hide' : 'keep');
  }

  /** Press a head-space point inside the hat (4 mm under its inner surface). */
  function press(p, extra = 0, wide = false) {   // extra: room (m) for a swinging strand's width; wide: the wide zone
    if (!hat) return p;
    const r = Math.hypot(p[0], p[1], p[2]); if (r < 1e-6) return p;
    const rh = lookupMin(wide ? hat.Rw : hat.R, p[0], p[1], p[2]); if (rh !== rh) return p;
    const lim = rh - 0.004 * shape.k - extra; if (r <= lim) return p;
    // where a rim sits on the skin there is no room for hair: it goes under the rim even if that is under the skin
    // (hidden there by the skin and the hat alike; keeping it on the skin poked it through the rim, 2026-11-23)
    const f = lim / r; return [p[0] * f, p[1] * f, p[2] * f];
  }

  async function build() {
    const v = ++version;
    const style = cur && S.styles[cur.id];
    const r = rule(headId);
    hat = null;
    if (r === 'under') {
      const it = ctx.D.items.items[headId];
      if (it?.attach) hat = await hatShape(ctx, shape, it.attach);
      if (v !== version) return;
    }
    if (mesh) { mesh.parent?.remove(mesh); mesh.geometry.dispose(); mesh = null; dyn = null; }
    if (!style || r === 'hide' || !style.pieces?.length) return;
    const K = makeKit(shape), B = makeBuilder();
    if (hat) K.below = (th, ph, lift = 0, half = 0) => {    // below the hat's edge, plus `half` (m: the piece's half-width)
      // the LAST covered angle going down (a tipped brim can leave a gap between the crown and the brim's back edge)
      let last = -1;
      // (only where the hat is within 3 cm of the skin: a wide brim far out does not block hair hanging under it)
      for (let t = th; t < 140; t += 2) { const p = K.S(t, ph, 0), r = lookupMin(hat.R, p[0], p[1], p[2]); if (r === r && r < V3.len(p) + 0.03 * K.k) last = t; }
      return last < 0 ? th : Math.min(140, last + 5 + half / 0.12 / DEG);   // never below the base of the skull (a root under the jaw)
    };
    const Ph = { rest: [], pin: [], pull: [], rad: [], links: [], chains: [] };
    const covered = r === 'under';
    for (const P0 of style.pieces) {
      const P = covered && P0.under ? { ...P0, ...P0.under } : P0;   // `under`: this piece's knobs under a hat
      if (covered && P.hat === 'drop') continue;
      if (!covered && P.hat === 'only') continue;
      if (P.kind === 'tail') buildTail(B, K, P, Ph, shape);
      else if (P.kind === 'sheet') buildSheet(B, K, P, Ph);
      else BUILD[P.kind]?.(B, K, P);
    }
    // statics: pressed under the hat, then head space -> Head bone frame
    const st = B.st, dy = B.dy, ns = st.pos.length / 3, nd = dy.pos.length / 3, N = ns + nd;
    const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), uv = new Float32Array(N * 2), col = new Float32Array(N * 4), tint = new Float32Array(N);
    const P2 = [];
    for (let i = 0; i < ns; i++) {
      const q0 = [st.pos[i * 3], st.pos[i * 3 + 1], st.pos[i * 3 + 2]];
      const p = st.tint[i] ? press(q0) : q0;   // a tie (not tinted) sits where its tail starts: never half-tucked
      P2.push(p); P2[i].tucked = p !== q0;
    }
    if (hat) {
      // a triangle with one corner tucked under the hat and the next just below the rim cut through the brim: points
      // next to a tucked point (two rings out) lie down on the scalp, so the hair dives under the rim (2026-11-23)
      const nb = Array.from({ length: ns }, () => []);
      for (let t = 0; t < st.idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = st.idx[t + e], b2 = st.idx[t + (e + 1) % 3]; nb[a].push(b2); nb[b2].push(a); }
      let ring = new Set(); for (let i = 0; i < ns; i++) if (P2[i].tucked) ring.add(i);
      const done = new Set(ring);
      for (let pass = 0; pass < 2; pass++) {
        const next = new Set();
        for (const i of ring) for (const j of nb[i]) if (!done.has(j) && st.tint[j]) { next.add(j); done.add(j); }
        for (const j of next) {
          const p = P2[j], r = Math.hypot(p[0], p[1], p[2]), rw = lookupMin(hat.Rw, p[0], p[1], p[2]);
          let floor = lookup(shape.R, p[0], p[1], p[2]) + 0.004;
          if (rw === rw) floor = Math.min(floor, rw - 0.004 * shape.k);   // a rim on the skin: under it, even under the skin
          if (r > floor) { const f = floor / r; P2[j] = [p[0] * f, p[1] * f, p[2] * f]; }
        }
        ring = next;
      }
    }
    for (let i = 0; i < ns; i++) {
      const p = P2[i];
      _v.set(p[0], p[1], p[2]).applyMatrix4(Mh); pos.set([_v.x, _v.y, _v.z], i * 3);
      _v.set(st.nor[i * 3], st.nor[i * 3 + 1], st.nor[i * 3 + 2]).transformDirection(Mh); nor.set([_v.x, _v.y, _v.z], i * 3);
    }
    uv.set(st.uv); uv.set(dy.uv, ns * 2); col.set(st.col); col.set(dy.col, ns * 4); tint.set(st.tint); tint.set(dy.tint, ns);
    const idx = st.idx.concat(dy.idx.map(i => i + ns));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(nd ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(nd ? THREE.DynamicDrawUsage : THREE.StaticDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.setAttribute('tint', new THREE.BufferAttribute(tint, 1));
    g.setIndex(N > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    mesh = new THREE.Mesh(g, material(THREE, cur.color || '#4a3020'));
    mesh.name = 'hair:' + cur.id; mesh.frustumCulled = false;
    head.add(mesh);
    if (nd) {
      if (hat) Ph.rest = Ph.rest.map(p => press(p));                       // under a hat the tails start tucked too
      const V = new Verlet(Ph.rest.length);
      Ph.pin.forEach((x, i) => { V.pin[i] = x; V.pull[i] = Ph.pull[i]; V.rad[i] = Ph.rad[i]; });
      for (const [a, b2, s] of Ph.links) V.link(a, b2, s);
      V.damping = style.damping ?? 0.05; V.jump = 0.5; V.iters = 6;   // 6 passes: a 9-point tail stays within ~5% of its length
      const cols = bodyColliders(bodyMesh, bones, ['neck', 'torso', 'shoulders', 'arms'], [{ a: [0, 0, 0], r: shape.rHead, update(c) {
        _v.set(0, -0.004, -0.004).applyMatrix4(_hm); c.a[0] = _v.x; c.a[1] = _v.y; c.a[2] = _v.z; c.r = shape.rHead * _hm.getMaxScaleOnAxis();
      } }]);
      dyn = { V, Ph, cols, ns, nd, bind: Float32Array.from(dy.bind), restW: new Float32Array(Ph.rest.length * 3),
        P: new Float32Array(Ph.rest.length * 3), T: new Float32Array(Ph.rest.length * 3), Sd: new Float32Array(Ph.rest.length * 3), Nn: new Float32Array(Ph.rest.length * 3) };
      writeRest();
    }
  }

  /** Before the first physics step: swinging parts drawn at their rest shape (head space → bone frame). */
  function writeRest() {
    const { Ph, ns, nd, bind, P } = dyn;
    Ph.rest.forEach((p, i) => { P[i * 3] = p[0]; P[i * 3 + 1] = p[1]; P[i * 3 + 2] = p[2]; });
    for (const ch of Ph.chains) ch.sideW = ch.side0;
    frames(); writeDyn(Mh, true);
    void ns; void nd; void bind;
  }

  /** Per chain point: position (already in dyn.P), tangent, side, normal. */
  function frames() {
    const { Ph, P, T, Sd, Nn } = dyn;
    for (const ch of Ph.chains) {
      const ids = ch.ids, n = ids.length;
      for (let i = 0; i < n; i++) {
        const a = ids[Math.max(0, i - 1)] * 3, b = ids[Math.min(n - 1, i + 1)] * 3, k = ids[i] * 3;
        let tx = P[b] - P[a], ty = P[b + 1] - P[a + 1], tz = P[b + 2] - P[a + 2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        T[k] = tx; T[k + 1] = ty; T[k + 2] = tz;
        let sx, sy, sz;
        if (ch.sheet) {       // side: toward the next column
          const { first, cols, c } = ch.sheet, A = Ph.chains[first + Math.max(0, c - 1)].ids[i] * 3, Bq = Ph.chains[first + Math.min(cols - 1, c + 1)].ids[i] * 3;
          sx = P[Bq] - P[A]; sy = P[Bq + 1] - P[A + 1]; sz = P[Bq + 2] - P[A + 2];
        } else if (i === 0) { sx = ch.sideW[0]; sy = ch.sideW[1]; sz = ch.sideW[2]; }
        else { const q = ids[i - 1] * 3; sx = Sd[q]; sy = Sd[q + 1]; sz = Sd[q + 2]; }   // carried down the chain
        const d = sx * tx + sy * ty + sz * tz; sx -= d * tx; sy -= d * ty; sz -= d * tz;
        const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
        Sd[k] = sx; Sd[k + 1] = sy; Sd[k + 2] = sz;
        Nn[k] = ty * sz - tz * sy; Nn[k + 1] = tz * sx - tx * sz; Nn[k + 2] = tx * sy - ty * sx;
      }
    }
  }

  /** Dynamic vertices from the chain points. `toBone` maps the points' space to the Head bone frame. */
  function writeDyn(toBone, headSpace) {
    const { Ph, P, T, Sd, Nn, bind, ns } = dyn, g = mesh.geometry, pos = g.attributes.position.array, nor = g.attributes.normal.array;
    const e = toBone.elements;
    const hm = headSpace ? null : _l.copy(MhInv);        // bone frame -> head space for the hat press
    for (let j = 0, vi = ns; j < bind.length; j += 6, vi++) {
      const ids = Ph.chains[bind[j]].ids, f = bind[j + 1], a = bind[j + 2], bb = bind[j + 3], na = bind[j + 4], nb = bind[j + 5];
      const n = ids.length, i0 = Math.min(n - 2, Math.floor(f)), t = f - i0;
      const i_1 = ids[Math.max(0, i0 - 1)] * 3, k0 = ids[i0] * 3, k1 = ids[i0 + 1] * 3, k2 = ids[Math.min(n - 1, i0 + 2)] * 3;
      const t2 = t * t, t3 = t2 * t;
      const c0 = -0.5 * t3 + t2 - 0.5 * t, c1 = 1.5 * t3 - 2.5 * t2 + 1, c2 = -1.5 * t3 + 2 * t2 + 0.5 * t, c3 = 0.5 * t3 - 0.5 * t2;
      let x = 0, y = 0, z = 0, nx = 0, ny = 0, nz = 0;
      for (let c = 0; c < 3; c++) {
        const px = P[i_1 + c] * c0 + P[k0 + c] * c1 + P[k1 + c] * c2 + P[k2 + c] * c3;
        const s = Sd[k0 + c] * (1 - t) + Sd[k1 + c] * t, m = Nn[k0 + c] * (1 - t) + Nn[k1 + c] * t;
        const val = px + s * a + m * bb, nv = s * na + m * nb;
        if (c === 0) { x = val; nx = nv; } else if (c === 1) { y = val; ny = nv; } else { z = val; nz = nv; }
      }
      let X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (hat) {
        const he = (headSpace ? null : hm.elements);
        const hp = headSpace ? [x, y, z] : [he[0] * X + he[4] * Y + he[8] * Z + he[12], he[1] * X + he[5] * Y + he[9] * Z + he[13], he[2] * X + he[6] * Y + he[10] * Z + he[14]];
        const q = press(hp, Math.abs(a) + Math.abs(bb), true);
        if (q !== hp) { _v.set(q[0], q[1], q[2]).applyMatrix4(Mh); X = _v.x; Y = _v.y; Z = _v.z; }
      }
      pos[vi * 3] = X; pos[vi * 3 + 1] = Y; pos[vi * 3 + 2] = Z;
      const NX = e[0] * nx + e[4] * ny + e[8] * nz, NY = e[1] * nx + e[5] * ny + e[9] * nz, NZ = e[2] * nx + e[6] * ny + e[10] * nz, nl = Math.hypot(NX, NY, NZ) || 1;
      nor[vi * 3] = NX / nl; nor[vi * 3 + 1] = NY / nl; nor[vi * 3 + 2] = NZ / nl;
    }
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
  }

  const api = {
    get id() { return cur?.id || null; },
    get mesh() { return mesh; },
    get rule() { return rule(headId); },
    styles: S.styles,
    /** { id, color } (a Chibi 2.6 look's hair) or null. Unknown ids fall back to 'short'. */
    async set(h) {
      const next = h && h.id && h.id !== 'none' ? { id: S.styles[h.id] ? h.id : (S.aliases?.[h.id] || 'short'), color: h.color || '#4a3020' } : null;
      if (next && cur && next.id === cur.id && next.color === cur.color && mesh) return;
      if (next && cur && next.id === cur.id && mesh) { cur = next; mesh.material = material(THREE, next.color); return; }
      cur = next; await build();
    },
    /** The head item now worn (or null): picks the hair's version under it (data/items.json `hair` rule). */
    setHead(id) {
      id = id || null; if (id === headId) return api.ready; headId = id;
      api.ready = build(); return api.ready;
    },
    ready: Promise.resolve(),
    update(dt) {
      if (!dyn || !mesh) return;
      const { V, Ph, cols, P } = dyn;
      group.updateWorldMatrix(true, false); head.updateWorldMatrix(true, false);
      _hm.copy(head.matrixWorld).multiply(Mh);                     // head space -> world
      const e = _hm.elements;
      for (let i = 0; i < Ph.rest.length; i++) {
        const p = Ph.rest[i];
        V.t1[i * 3] = e[0] * p[0] + e[4] * p[1] + e[8] * p[2] + e[12];
        V.t1[i * 3 + 1] = e[1] * p[0] + e[5] * p[1] + e[9] * p[2] + e[13];
        V.t1[i * 3 + 2] = e[2] * p[0] + e[6] * p[1] + e[10] * p[2] + e[14];
      }
      for (const ch of Ph.chains) if (!ch.sheet) { _v.set(...ch.side0).transformDirection(_hm); ch.sideW = [_v.x, _v.y, _v.z]; }
      cols.update();
      V.step(dt, cols);
      if (hat) {   // the inside of the hat is a collider too: free points it covers go back under it
        _l.copy(_hm).invert(); const ie = _l.elements;
        for (let i = 0; i < Ph.rest.length; i++) {
          if (V.pin[i]) continue;
          const k = i * 3, x = V.p[k], y = V.p[k + 1], z = V.p[k + 2];
          const hp = [ie[0] * x + ie[4] * y + ie[8] * z + ie[12], ie[1] * x + ie[5] * y + ie[9] * z + ie[13], ie[2] * x + ie[6] * y + ie[10] * z + ie[14]];
          const q = press(hp, V.rad[i] * 1.6, true); if (q === hp) continue;
          const wx = e[0] * q[0] + e[4] * q[1] + e[8] * q[2] + e[12], wy = e[1] * q[0] + e[5] * q[1] + e[9] * q[2] + e[13], wz = e[2] * q[0] + e[6] * q[1] + e[10] * q[2] + e[14];
          V.q[k] += wx - x; V.q[k + 1] += wy - y; V.q[k + 2] += wz - z; V.p[k] = wx; V.p[k + 1] = wy; V.p[k + 2] = wz;
        }
      }
      P.set(V.p);
      frames();
      writeDyn(_w.copy(head.matrixWorld).invert(), false);
    },
    /** Settle the swinging parts at the current pose (screenshots, a character placed somewhere new). */
    settle() { if (dyn) dyn.V.ready = false; },
    stats() { const g = mesh?.geometry; return g ? { triangles: g.index.count / 3, draws: 1, chains: dyn?.Ph.chains.length || 0, points: dyn?.Ph.rest.length || 0 } : { triangles: 0, draws: 0, chains: 0, points: 0 }; },
    /** for tests: head space info */
    _shape: shape, _hat: () => hat, _dyn: () => dyn,
    dispose() { if (mesh) { mesh.parent?.remove(mesh); mesh.geometry.dispose(); mesh = null; } dyn = null; },
  };
  return api;
}
export const _lookupR = (g, x, y, z) => lookup(g, x, y, z);   // tests
