// Wyrmroad render kit: the one toon material family, a batch builder that merges hundreds of low-poly pieces into a few
// meshes (one draw call per ~32 m chunk of road), small canvas textures (sky, road surfaces, soft blobs, angle masks)
// and the glyph atlas the damage numbers are drawn from. Everything here is made once and shared — no material is
// created or disposed per hit (lessons rule 29).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Seeded random (mulberry32) so a chapter's street is the same every time it is built. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------------------------------------ materials
let gradient = null;
/** Three-step light ramp shared by every toon material (soft, storybook banding). */
export function toonRamp() {
  if (gradient) return gradient;
  const px = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 235, 235, 235, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(px, 4, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter; gradient.generateMipmaps = false; gradient.needsUpdate = true;
  return gradient;
}
const matCache = new Map();
/** The toon family. `kind`: 'batch' (vertex colours, flat), 'smooth' (vertex colours, smooth), 'glow' (unlit vertex colours). */
export function mat(kind = 'batch', o = {}) {
  const key = kind + JSON.stringify(o);
  if (matCache.has(key)) return matCache.get(key);
  let m;
  if (kind === 'glow') m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, toneMapped: false, ...o });   // lit glass keeps its colour
  else if (kind === 'water') m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), transparent: true, opacity: 0.86, depthWrite: false, ...o });
  else if (kind === 'mist') m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false, fog: true, ...o });
  else m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), ...o });
  matCache.set(key, m);
  return m;
}
/** A toon material with a texture (road surfaces). Cached by texture. */
const texMats = new WeakMap();
export function texMat(map) {
  if (texMats.has(map)) return texMats.get(map);
  const m = new THREE.MeshToonMaterial({ map, gradientMap: toonRamp() });
  texMats.set(map, m);
  return m;
}

// ------------------------------------------------------------------------------------------------ batch builder
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const geoCache = new Map();
/** Shared low-poly primitive geometries (never disposed: they are reused by every chapter). */
export function prim(name, ...a) {
  const key = name + a.join(',');
  let g = geoCache.get(key);
  if (g) return g;
  switch (name) {
    case 'box': g = new THREE.BoxGeometry(1, 1, 1); break;
    case 'cyl': g = new THREE.CylinderGeometry(1, 1, 1, a[0] || 8, 1); break;
    case 'cone': g = new THREE.ConeGeometry(1, 1, a[0] || 8, 1); break;
    case 'sphere': g = new THREE.SphereGeometry(1, a[0] || 8, a[1] || 6); break;
    case 'ico': g = new THREE.IcosahedronGeometry(1, a[0] || 0); break;
    case 'dodeca': g = new THREE.DodecahedronGeometry(1, 0); break;
    case 'prism': {   // a roof: triangular prism, ridge along x, 1×1×1
      const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.lineTo(-0.5, 0);
      g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); g.rotateY(Math.PI / 2); break;
    }
    case 'torus': g = new THREE.TorusGeometry(1, a[0] || 0.1, 6, a[1] || 16); break;
    case 'plane': g = new THREE.PlaneGeometry(1, 1, a[0] || 1, a[1] || 1); break;
    case 'arch': {   // an arch opening frame (1 wide, 1 tall, 0.2 deep): a block with a round-topped hole
      const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0.5, 1); s.lineTo(-0.5, 1); s.lineTo(-0.5, 0);
      const h = new THREE.Path(); h.moveTo(-0.34, 0); h.lineTo(0.34, 0); h.lineTo(0.34, 0.62); h.absarc(0, 0.62, 0.34, 0, Math.PI, false); h.lineTo(-0.34, 0);
      s.holes.push(h); g = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: false, curveSegments: 6 }); g.translate(0, 0, -0.1); break;
    }
    case 'horn': {   // a curved horn spire: a cone bent along a quarter arc (base at y=0, height 1)
      const pts = []; const n = 7;
      for (let i = 0; i <= n; i++) { const t = i / n; pts.push(new THREE.Vector2(Math.max(0.001, 0.5 * (1 - t) ** 1.2), t)); }
      g = new THREE.LatheGeometry(pts, 7);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + (y * y) * 0.45); }
      g.computeVertexNormals(); break;
    }
    default: throw new Error('no prim ' + name);
  }
  geoCache.set(key, g);
  return g;
}

/**
 * Collects pieces and merges them into one vertex-coloured mesh per chunk of road (so the camera culls far chunks).
 *   const b = new Batch(32); b.add(prim('box'), { x, y, z, sx, sy, sz, ry }, '#a07050'); scene.add(b.build(mat()));
 */
export class Batch {
  constructor(chunk = 32) { this.chunk = chunk; this.parts = new Map(); this.count = 0; }
  add(geo, t = {}, color = '#888888', { jitter = 0, rand = null } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv'); if (g.attributes.uv1) g.deleteAttribute('uv1');
    tmpE.set(t.rx || 0, t.ry || 0, t.rz || 0);
    tmpQ.setFromEuler(tmpE);
    tmpS.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1);
    tmpP.set(t.x || 0, t.y || 0, t.z || 0);
    tmpM.compose(tmpP, tmpQ, tmpS);
    if (t.m) tmpM.premultiply(t.m);
    g.applyMatrix4(tmpM);
    const c = new THREE.Color(color);
    if (jitter && rand) c.offsetHSL(0, 0, (rand() - 0.5) * jitter);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const key = Math.floor((t.x || 0) / this.chunk);
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(g); this.count++;
    return this;
  }
  /** One mesh per chunk, in a group. */
  build(material, { shadows = false, receive = true, name = 'batch', flat = true } = {}) {
    const group = new THREE.Group(); group.name = name;
    for (const geos of this.parts.values()) {
      const g = mergeGeometries(geos, false);
      for (const x of geos) x.dispose();
      if (!g) continue;
      if (flat) g.computeVertexNormals();     // non-indexed → one normal per face: the faceted low-poly look
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, material); m.castShadow = shadows; m.receiveShadow = receive; m.matrixAutoUpdate = false; m.updateMatrix();
      group.add(m);
    }
    this.parts.clear();
    return group;
  }
}

// ------------------------------------------------------------------------------------------------ canvas textures
export function canvasTex(w, h, draw, { repeat = null, srgb = true, nearest = false } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  if (nearest) t.magFilter = THREE.NearestFilter;
  t.anisotropy = 4;
  return t;
}
/** Vertical sky gradient (stops: [[0..1, '#hex'], ...], top first). */
export function skyTex(stops) {
  return canvasTex(4, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    for (const [k, c] of stops) gr.addColorStop(k, c);
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  });
}
let blob = null;
/** Soft round dark blob (shadows under characters). */
export function blobTex() {
  if (blob) return blob;
  blob = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  return blob;
}
let glowT = null;
/** Soft round white glow (sprites for sparks, fireflies, lantern halos). */
export function glowTex() {
  if (glowT) return glowT;
  glowT = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  return glowT;
}
let angleT = null;
/** Alpha = 1 − angle/2π around the centre: with alphaTest = 1 − k a ring shows the first k of its turn (fill meters). */
export function angleMaskTex() {
  if (angleT) return angleT;
  angleT = canvasTex(128, 128, (g) => {
    const img = g.createImageData(128, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      // start at 12 o'clock and run clockwise when seen from above (ring lies in the x-z plane, uv v = -z)
      let a = Math.atan2(x - 63.5, 63.5 - y); if (a < 0) a += Math.PI * 2;
      const i = (y * 128 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(255 * (1 - a / (Math.PI * 2)));
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false });
  return angleT;
}

// ------------------------------------------------------------------------------------------------ glyph atlas
// White glyphs with a dark rim; tinted per sprite through SpriteMaterial.color. Digits and words used over the fight.
export const WORDS = ['Blocked', 'Perfect!', 'Level up!', 'Armour', 'No mana', 'Revived'];
let atlas = null;
export function glyphAtlas() {
  if (atlas) return atlas;
  const W = 512, H = 512, cw = 40, ch = 60, rects = {};
  const tex = canvasTex(W, H, (g) => {
    g.textBaseline = 'middle'; g.textAlign = 'center'; g.lineJoin = 'round';
    const glyphs = '0123456789,+!−xpgold·';
    g.font = '900 50px "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
    [...glyphs].forEach((c, i) => {
      const x = (i % 12) * cw, y = Math.floor(i / 12) * ch;
      g.lineWidth = 9; g.strokeStyle = 'rgba(20,12,8,0.95)'; g.strokeText(c, x + cw / 2, y + ch / 2 + 2);
      g.fillStyle = '#ffffff'; g.fillText(c, x + cw / 2, y + ch / 2 + 2);
      rects[c] = { x, y, w: cw, h: ch, adv: c === ',' || c === '·' ? 0.45 : c === '!' || c === 'l' ? 0.5 : 0.78 };
    });
    g.font = '900 40px "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
    WORDS.forEach((w, i) => {
      const y = 2 * ch + 8 + i * 54, tw = Math.min(W - 10, g.measureText(w).width + 18);
      g.lineWidth = 8; g.strokeStyle = 'rgba(20,12,8,0.95)'; g.strokeText(w, tw / 2 + 4, y + 26);
      g.fillStyle = '#ffffff'; g.fillText(w, tw / 2 + 4, y + 26);
      rects[w] = { x: 0, y, w: tw + 8, h: 52, adv: 1 };
    });
  }, { srgb: true });
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  atlas = { tex, rects, W, H };
  return atlas;
}

/** Colour helpers. */
export const hex = c => new THREE.Color(c);
export function mixHex(a, b, k) { return '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString(); }
export const clamp01 = v => Math.max(0, Math.min(1, v));
export const lerp = (a, b, k) => a + (b - a) * k;

/** Merge a little group of single-colour meshes (a crate, a pie, a ground weapon) into ONE vertex-coloured mesh. */
export function mergeGroup(group, { material = null, shadows = true } = {}) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const b = new Batch(1e9);
  const m4 = new THREE.Matrix4();
  group.traverse(o => {
    if (!o.isMesh) return;
    m4.multiplyMatrices(inv, o.matrixWorld);
    b.add(o.geometry, { m: m4 }, '#' + (o.material.color ? o.material.color.getHexString() : 'ffffff'));
    o.geometry.dispose(); o.material.dispose?.();
  });
  const out = b.build(material || mat('smooth'), { shadows, receive: true, flat: false, name: 'merged' });
  const mesh = out.children[0];
  mesh.matrixAutoUpdate = true;
  return mesh;
}
