// House Kit — the three.js "build its pieces" step. Parts from js/describe.js become painted triangles: every part is
// laid on the ONE texture atlas (textures/atlas.webp, Codex-painted, see data/atlas.json) with a small shader that
// repeats each atlas square on its own, so a whole town chunk — walls, roofs, decorations, yard clutter — is one mesh
// and one draw call. Kenney kit pieces (CC0) keep their shapes; each of their triangles takes the look its palette
// square stands for (plaster panel, timber frame, shutters…).
//
//   const kit = await loadHouseKit({ quality })          kit.S (styles)  kit.A (atlas)  kit.material
//   const sink = kit.sink()                              growable triangle list
//   kit.addParts(sink, parts, frame)                     frame = { at:[x,z], facing, y0 } (house) or null (world parts)
//   const geo = sink.geometry()                          one BufferGeometry: position, normal, uv, tile, color
//
// Texture coordinates are worked out in metres from the house's own origin, so plaster and stone courses run on
// across neighbouring pieces and start at the floor line.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ROOT = new URL('../../', import.meta.url);                 // the playground folder
const HERE = new URL('../', import.meta.url);                    // housekit/
const KIT = { town: 'assets/kenney/fantasy-town/', survival: 'assets/kenney/survival/' };
const loader = new GLTFLoader();

// ---------------------------------------------------------------- Kenney pieces: geometry + the palette square per triangle
const pieceCache = new Map();
/** A kit piece as a non-indexed geometry (position, normal) + per triangle its palette square ('col,row') and whether
 *  it stands out of the wall face (shutters, sills: 'trim'). */
export function kitPiece(kit, id) {
  const key = kit + ':' + id;
  if (!pieceCache.has(key)) pieceCache.set(key, loader.loadAsync(new URL(KIT[kit] + id + '.glb', ROOT).href).then(g => {
    g.scene.updateMatrixWorld(true);
    const pos = [], nrm = [], cell = [], trim = [];
    const wall = id.startsWith('wall');
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!mats[0]?.map) return;                                   // (a fountain's water has no picture: drawn by the kit)
      let geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (geo.index) geo = geo.toNonIndexed();
      const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv;
      for (let i = 0; i < P.count; i += 3) {
        const u = (U.getX(i) + U.getX(i + 1) + U.getX(i + 2)) / 3, v = (U.getY(i) + U.getY(i + 1) + U.getY(i + 2)) / 3;
        const key = Math.floor(u * 16) + ',' + Math.floor(v * 4);
        cell.push(key);
        // shutters and sills: wood (the timber square) standing out of the wall face
        const mn = Math.min(P.getX(i), P.getX(i + 1), P.getX(i + 2));
        trim.push(wall && key === '9,3' && mn < 0.395);
        for (let k = 0; k < 3; k++) { pos.push(P.getX(i + k), P.getY(i + k), P.getZ(i + k)); nrm.push(N.getX(i + k), N.getY(i + k), N.getZ(i + k)); }
      }
    });
    if (!pos.length) return null;
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), cell, trim, tris: cell.length };
  }).catch(e => { console.warn('housekit piece', key, e); return null; }));
  return pieceCache.get(key);
}

// ---------------------------------------------------------------- generated shapes: triangle lists in the part's frame
// each returns { pos: [...], nrm?: [...], uv?: [...], face?: [...] } — face = per triangle 'top' | 'bottom' | 'side'
function boxTris(w, h, d) {
  const x = w / 2, y = h / 2, z = d / 2, pos = [], face = [];
  const quad = (a, b, c, d_, f) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d_); face.push(f, f); };
  quad([-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z], 'top');
  quad([-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], 'bottom');
  quad([-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], 'endz');
  quad([x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], 'endz');
  quad([x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z], 'endx');
  quad([-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z], 'endx');
  return { pos, face };
}
function cylTris(rt, rb, h, n, capTop = true, capBottom = true) {
  const pos = [], face = [], y0 = -h / 2, y1 = h / 2;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    const b0 = [Math.sin(a0) * rb, y0, Math.cos(a0) * rb], b1 = [Math.sin(a1) * rb, y0, Math.cos(a1) * rb];
    const t0 = [Math.sin(a0) * rt, y1, Math.cos(a0) * rt], t1 = [Math.sin(a1) * rt, y1, Math.cos(a1) * rt];
    pos.push(...b0, ...b1, ...t1, ...b0, ...t1, ...t0); face.push('side', 'side');
    if (capTop && rt > 0.001) { pos.push(0, y1, 0, ...t0, ...t1); face.push('top'); }
    if (capBottom && rb > 0.001) { pos.push(0, y0, 0, ...b1, ...b0); face.push('bottom'); }
  }
  return { pos, face };
}
function coneTris(rb, h, n) { return cylTris(0.0001, rb, h, n, false, true); }
function quadTris(w, h, fit) {
  const x = w / 2, y = h / 2, pos = [-x, -y, 0, x, -y, 0, x, y, 0, -x, -y, 0, x, y, 0, -x, y, 0];
  const e = 0.999, uv = fit ? [0, e, e, e, e, 0, 0, e, e, 0, 0, 0] : null;      // image rows run down: v 0 = top
  return { pos, uv, face: ['side', 'side'] };
}
let blobBase = null;
function blobTris(r) {
  if (!blobBase) { const g = new THREE.IcosahedronGeometry(1, 0); blobBase = Array.from(g.attributes.position.array); g.dispose(); }
  const pos = blobBase.map((v, i) => v * r * (i % 3 === 1 ? 0.8 : 1));
  return { pos, face: new Array(pos.length / 9).fill('side') };
}
function triTris(pts) { const [a, b, c] = pts; return { pos: [...a, ...b, ...c, ...a, ...c, ...b], face: ['side', 'side'], abs: true }; }

// ---------------------------------------------------------------- the triangle sink (growable typed arrays)
class Sink {
  constructor() { this.n = 0; this.cap = 0; this.grow(4096); }
  grow(min) {
    const cap = Math.max(min, this.cap * 2), v = cap * 3;
    const cp = (old, size) => { const a = new (old?.constructor || Float32Array)(v * size); if (old) a.set(old.subarray(0, this.n * 3 * size)); return a; };
    this.pos = cp(this.pos, 3); this.nrm = cp(this.nrm, 3); this.uv = cp(this.uv, 2);
    const t = new Uint16Array(v * 4); if (this.tile) t.set(this.tile.subarray(0, this.n * 12)); this.tile = t;
    const c = new Uint8Array(v * 4); if (this.col) c.set(this.col.subarray(0, this.n * 12)); this.col = c;
    this.cap = cap;
  }
  geometry() {
    const g = new THREE.BufferGeometry(), v = this.n * 3;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, v * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.slice(0, v * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, v * 2), 2));
    g.setAttribute('tile', new THREE.BufferAttribute(this.tile.slice(0, v * 4), 4, true));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, v * 4), 4, true));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  get triangles() { return this.n; }
}

// ---------------------------------------------------------------- the kit
const _m = new THREE.Matrix4(), _f = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// one kit per quality for every caller that takes the stock styles + atlas (Oathwild's towns and its arena share one
// painted atlas on the graphics card instead of loading it twice)
const KITS = new Map();
export function loadHouseKit(opts = {}) {
  if (opts.styles || opts.atlas) return loadHouseKitFresh(opts);
  const q = opts.quality || 'medium';
  if (!KITS.has(q)) KITS.set(q, loadHouseKitFresh(opts).catch(e => { KITS.delete(q); throw e; }));
  return KITS.get(q);
}
async function loadHouseKitFresh({ quality = 'medium', styles = null, atlas = null } = {}) {
  const [S, A] = await Promise.all([
    styles || fetch(new URL('data/styles.json', HERE)).then(r => r.json()),
    atlas || fetch(new URL('data/atlas.json', HERE)).then(r => r.json()),
  ]);
  const small = quality === 'low' && A.small;
  const file = small ? A.small : A.file;
  const tex = await new THREE.TextureLoader().loadAsync(new URL('textures/' + file, HERE).href);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  const size = small ? A.size / 2 : A.size;
  const material = atlasMaterial(tex, size, A);
  // every piece the styles may ask for, loaded once
  const want = new Set();
  for (const f of Object.values(S.families)) if (f.ground) for (const id of [...f.ground, ...f.upper, f.door, f.plain, f.small]) { want.add('town:' + id); if (S.lowSwap[id]) want.add('town:' + S.lowSwap[id]); }
  for (const id of ['overhang', 'banner-red', 'banner-green', 'wall-door']) want.add('town:' + id);
  for (const [k, v] of Object.entries(S.props)) if (!k.startsWith('_')) want.add(v[0] + ':' + v[1]);
  want.add('survival:barrel');
  const P = {};
  await Promise.all([...want].map(async k => { const [kit, id] = k.split(':'); P[k] = await kitPiece(kit, id); }));
  const looks = {};
  for (const [id, L] of Object.entries(S.looks)) {
    const t = A.tiles[L.tex];
    if (!t) { console.warn('housekit: no atlas square for', id); continue; }
    looks[id] = { rect: t.rect, metres: t.metres, mode: L.mode || (t.tile === 'band' ? 'band' : t.tile === 'cells' ? 'fit' : 'wrap'), maxBand: L.maxBand || 0.6, cells: t.cells, sub: t.sub };
  }
  const stats = { parts: 0, missing: new Set() };
  const kit = { S, A, material, texture: tex, looks, pieces: P, stats, quality, sink: () => new Sink() };
  kit.addParts = (sink, parts, frame = null) => addParts(kit, sink, parts, frame);
  return kit;
}

/** The one material: Lambert, the atlas, vertex tints, and each atlas square repeating on its own. */
export function atlasMaterial(tex, size, A) {
  const mat = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true });
  mat.name = 'housekit atlas';
  const maxLod = Math.log2(A.gutter || 32) - 0.5;
  mat.onBeforeCompile = sh => {
    sh.uniforms.atlasSize = { value: size };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 tile;\nvarying vec4 vTile;\nvarying vec2 vTUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvTile = tile; vTUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vTile;\nvarying vec2 vTUv;\nuniform float atlasSize;')
      .replace('#include <map_fragment>', `
        vec2 hkCell = fract(vTUv);
        vec2 hkUv = vTile.xy + hkCell * vTile.zw;
        vec2 hkGx = dFdx(vTUv) * vTile.zw * atlasSize, hkGy = dFdy(vTUv) * vTile.zw * atlasSize;
        float hkLod = clamp(0.5 * log2(max(max(dot(hkGx, hkGx), dot(hkGy, hkGy)), 1e-8)), 0.0, ${maxLod.toFixed(2)});
        vec4 sampledDiffuseColor = textureLod(map, hkUv, hkLod);
        diffuseColor *= sampledDiffuseColor;`);
  };
  mat.customProgramCacheKey = () => 'housekit-atlas-v1';
  return mat;
}

// ---------------------------------------------------------------- parts → painted triangles
function addParts(kit, sink, parts, frame) {
  // the frame: house → world (turn by facing about its centre); uv origin = the house's floor line
  if (frame) _f.compose(_v.set(frame.at[0], 0, frame.at[1]), _q.setFromAxisAngle(UP, frame.facing || 0), _s.set(1, 1, 1));
  else _f.identity();
  const origin = frame ? [frame.at[0], frame.y0 ?? 0, frame.at[1]] : [0, 0, 0];
  for (const part of parts) {
    kit.stats.parts++;
    let tris, perTri = null;
    if (part.s === 'kit') {
      const src = kit.pieces[part.kit + ':' + part.id];
      if (!src) { kit.stats.missing.add(part.kit + ':' + part.id); continue; }
      tris = { pos: src.pos, nrm: src.nrm };
      perTri = i => { const c = part.cells || {}; const L = (src.trim[i] && c.trim) || c[src.cell[i]] || c['*'] || ['stone', '#ffffff']; return L; };
    } else if (part.s === 'box') tris = boxTris(part.w, part.h, part.d);
    else if (part.s === 'cyl') tris = cylTris(part.rt, part.rb, part.h, part.n || 8);
    else if (part.s === 'cone') tris = coneTris(part.rb, part.h, part.n || 4);
    else if (part.s === 'quad') tris = quadTris(part.w, part.h, !!part.fit);
    else if (part.s === 'blob') tris = blobTris(part.rad);
    else if (part.s === 'tri') tris = triTris(part.pts);
    else continue;
    // part → house frame → world
    if (tris.abs) _m.copy(_f);
    else {
      const sc = part.sc || [1, 1, 1], r = part.r || [0, 0, 0];
      _e.set(r[0], r[1], r[2], 'YXZ');
      _m.compose(_p.set(part.p[0], part.p[1], part.p[2]), _q.setFromEuler(_e), _s.set(sc[0], sc[1], sc[2]));
      _m.premultiply(_f);
    }
    _nm.getNormalMatrix(_m);
    emit(kit, sink, tris, _m, _nm, part, perTri, origin, frame);
  }
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _cc = new THREE.Vector3(), _t = new THREE.Vector3(), _bt = new THREE.Vector3(), _fn = new THREE.Vector3();
const tintCache = new Map();
function tintRGB(hex) {
  let c = tintCache.get(hex);
  if (!c) { _c.set(hex || '#ffffff'); c = [Math.round(Math.min(1, _c.r) * 255), Math.round(Math.min(1, _c.g) * 255), Math.round(Math.min(1, _c.b) * 255)]; tintCache.set(hex, c); }
  return c;
}

function emit(kit, sink, tris, M, NM, part, perTri, origin, frame) {
  const P = tris.pos, N = tris.nrm, nt = P.length / 9;
  if (sink.n + nt > sink.cap) sink.grow(sink.n + nt);
  const base = frame?.y0 ?? null;
  for (let i = 0; i < nt; i++) {
    // look + tint for this triangle
    let lookId = part.m, tint = part.t;
    if (perTri) { const L = perTri(i); lookId = L[0]; tint = L[1]; }
    else if (tris.face) {
      const f = tris.face[i];
      if (part.under && f === 'bottom') lookId = part.under;
      else if (part.edge && (f === 'endx' || f === 'endz')) { lookId = part.edge[0]; tint = part.edge[1]; }
    }
    const look = kit.looks[lookId] || kit.looks.stone;
    const [tr, tg, tb] = tintRGB(tint);
    const o = (sink.n + i) * 9;
    for (let k = 0; k < 3; k++) {
      _v.set(P[i * 9 + k * 3], P[i * 9 + k * 3 + 1], P[i * 9 + k * 3 + 2]).applyMatrix4(M);
      sink.pos[o + k * 3] = _v.x; sink.pos[o + k * 3 + 1] = _v.y; sink.pos[o + k * 3 + 2] = _v.z;
    }
    // face normal (world) — for lighting where the source has none, and for laying the texture on
    _a.fromArray(sink.pos, o); _b.fromArray(sink.pos, o + 3); _cc.fromArray(sink.pos, o + 6);
    _fn.subVectors(_cc, _b).cross(_t.subVectors(_a, _b)).normalize();
    for (let k = 0; k < 3; k++) {
      if (N) _n.set(N[i * 9 + k * 3], N[i * 9 + k * 3 + 1], N[i * 9 + k * 3 + 2]).applyMatrix3(NM).normalize();
      else _n.copy(_fn);
      sink.nrm[o + k * 3] = _n.x; sink.nrm[o + k * 3 + 1] = _n.y; sink.nrm[o + k * 3 + 2] = _n.z;
    }
    // texture axes: t horizontal along the face, b up the face (down the slope of a roof); tops use world x / z
    const ny = _fn.y;
    if (Math.abs(ny) > 0.92) { _t.set(1, 0, 0); _bt.set(0, 0, ny > 0 ? -1 : 1); }
    else { _t.crossVectors(UP, _fn).normalize(); _bt.crossVectors(_fn, _t).normalize(); }
    const uvo = (sink.n + i) * 6;
    let rect = look.rect;
    if (look.mode === 'fit' && part.fit && tris.uv) {
      const [cx, cy, cols, rows] = part.fit, [x0, y0, w, h] = look.rect;
      rect = [x0 + w * cx / cols, y0 + h * cy / rows, w / cols, h / rows];
      for (let k = 0; k < 3; k++) { sink.uv[uvo + k * 2] = tris.uv[(i * 3 + k) * 2]; sink.uv[uvo + k * 2 + 1] = tris.uv[(i * 3 + k) * 2 + 1]; }
    } else {
      const m = look.metres;
      let ta = 0, tb = 0, tmin = Infinity, tmax = -Infinity, bmin = Infinity, bmax = -Infinity;
      const us = [0, 0, 0], vs = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        const x = sink.pos[o + k * 3] - origin[0], y = sink.pos[o + k * 3 + 1] - origin[1], z = sink.pos[o + k * 3 + 2] - origin[2];
        ta = x * _t.x + y * _t.y + z * _t.z; tb = x * _bt.x + y * _bt.y + z * _bt.z;
        us[k] = ta; vs[k] = tb; tmin = Math.min(tmin, ta); tmax = Math.max(tmax, ta); bmin = Math.min(bmin, tb); bmax = Math.max(bmax, tb);
      }
      const et = tmax - tmin, eb = bmax - bmin;
      if (look.mode === 'band' && Math.min(et, eb) <= look.maxBand && Math.min(et, eb) > 0.005) {
        // one beam across the face: along = the long way, across spans the band's painted borders
        const alongT = et >= eb;
        for (let k = 0; k < 3; k++) {
          const along = alongT ? us[k] : vs[k], acr = alongT ? (bmax - vs[k]) / eb : (us[k] - tmin) / et;
          sink.uv[uvo + k * 2] = along / m; sink.uv[uvo + k * 2 + 1] = Math.min(0.999, Math.max(0, acr));
        }
      } else {
        for (let k = 0; k < 3; k++) { sink.uv[uvo + k * 2] = us[k] / m; sink.uv[uvo + k * 2 + 1] = -vs[k] / m; }
      }
      // keep the numbers small (precision) without moving the picture: shift by whole repeats
      if (look.mode !== 'band' || Math.min(et, eb) > look.maxBand) {
        const su = Math.floor(sink.uv[uvo]), sv = Math.floor(sink.uv[uvo + 1]);
        for (let k = 0; k < 3; k++) { sink.uv[uvo + k * 2] -= su; sink.uv[uvo + k * 2 + 1] -= sv; }
      } else { const su = Math.floor(sink.uv[uvo]); for (let k = 0; k < 3; k++) sink.uv[uvo + k * 2] -= su; }
    }
    const to = (sink.n + i) * 12;
    for (let k = 0; k < 3; k++) {
      sink.tile[to + k * 4] = Math.round(rect[0] * 65535); sink.tile[to + k * 4 + 1] = Math.round(rect[1] * 65535);
      sink.tile[to + k * 4 + 2] = Math.round(rect[2] * 65535); sink.tile[to + k * 4 + 3] = Math.round(rect[3] * 65535);
      // painted ground shadow: the lowest metre and a half of a house is a touch darker
      let sh = 1;
      if (base != null) sh = Math.max(0.78, Math.min(1, 0.78 + 0.22 * (sink.pos[o + k * 3 + 1] - base) / 1.6));
      sink.col[to + k * 4] = tr * sh; sink.col[to + k * 4 + 1] = tg * sh; sink.col[to + k * 4 + 2] = tb * sh; sink.col[to + k * 4 + 3] = 255;
    }
  }
  sink.n += nt;
}

/** Build one described house into its own mesh (the review page; the game merges whole chunks instead). */
export function houseMesh(kit, desc, house) {
  const sink = kit.sink();
  kit.addParts(sink, desc.parts, { at: house.at, facing: house.facing, y0: house.baseY ?? house.floorY });
  const mesh = new THREE.Mesh(sink.geometry(), kit.material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
