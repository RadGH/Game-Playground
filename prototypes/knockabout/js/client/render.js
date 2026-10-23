// The 3D view: one renderer and scene for every screen. Builds an arena's static parts from its data, moves its hazards
// from the snapshot (with a clear warning before each one bites: glow, sparks, flicker), keeps a puppet per fighter,
// plays the hit / grab / throw / poof effects, and flies a camera that frames every fighter still in.
//
// Arena data (data/arenas.json, read through the sim's ARENAS) is plain shapes; `shapesOf()` accepts the few spellings a
// shape may come in ({ box: {p,size,rot} }, { type:'box', p, size }, { shape:'box', ... }, cyl / ramp likewise).
import * as THREE from 'three';
import { createPuppet } from './puppet.js';

THREE.InstancedMesh.prototype.intersectsFrustum = function () { return true; };

export function pickQuality() {
  const q = new URLSearchParams(location.search).get('quality'); if (q) return q;
  try { const c = document.createElement('canvas'), g = c.getContext('webgl2') || c.getContext('webgl'), e = g?.getExtension('WEBGL_debug_renderer_info');
    if (/swiftshader|llvmpipe|software/i.test(e ? String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)) : '')) return 'low'; } catch { /* no info */ }
  const phone = (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) && Math.min(innerWidth, innerHeight) < 500;
  return phone ? 'medium' : 'high';
}

const arr3 = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v.x || 0, v.y || 0, v.z || 0] : [0, 0, 0]);
/** Normalise one static shape: -> { type: 'box'|'cyl'|'ramp', p, size, r, h, rot, color, role } or null. */
export function shapeOf(s) {
  if (!s || typeof s !== 'object') return null;
  for (const t of ['box', 'cyl', 'ramp', 'cylinder']) if (s[t] && typeof s[t] === 'object') return { ...s, ...s[t], type: t === 'cylinder' ? 'cyl' : t };
  const t = s.type || s.shape || s.kind;
  if (t === 'box' || t === 'cyl' || t === 'ramp' || t === 'cylinder') return { ...s, type: t === 'cylinder' ? 'cyl' : t };
  return null;
}
/** Every static shape of an arena, from whichever list it keeps them in. */
export function shapesOf(arena) {
  const lists = [arena.statics, arena.static, arena.geometry, arena.shapes, arena.solids, arena.parts].filter(Array.isArray);
  return lists.flat().map(shapeOf).filter(Boolean);
}
const themeOf = arena => {
  const t = arena.theme || {};
  const sky = Array.isArray(t.sky) ? t.sky : [t.sky || '#1b1f4a', t.sky || '#4f3a7a'];
  return { ...t, floor: t.floor || '#e8d9b0', wall: t.wall || '#3a3f4a', edge: t.edge || '#2a2f3a', accent: t.accent || '#ffd23f', hazard: t.hazard || '#ff3d3d',
    sky, fog: t.fog || sky[0], light: t.light || '#fff4dc', metal: t.crusher || t.post || '#9aa3ad', spikes: t.spikes || '#c9ced6', ground: t.fog || sky[0] };
};
/** A shape's colour: a theme key ('floor', 'rope' …) or a literal colour. */
const colourOf = (T, c, fallback) => (typeof c === 'string' ? (T[c] && typeof T[c] === 'string' ? T[c] : /^#|^rgb/.test(c) ? c : fallback) : fallback);
function toyMat(color, { rough = 0.55, metal = 0, emissive = null } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = 0; }
  return m;
}
function checkerTex(a, b, n = 8) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * 128 / n, j * 128 / n, 128 / n, 128 / n); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const shade = (hex, k) => { const c = new THREE.Color(hex); c.offsetHSL(0, 0, k); return '#' + c.getHexString(); };
const applyRot = (o, rot) => {
  if (!rot) return;
  if (typeof rot === 'number') o.rotation.y = rot;
  else if (Array.isArray(rot) && rot.length === 4) o.quaternion.set(rot[0], rot[1], rot[2], rot[3]);
  else if (Array.isArray(rot)) o.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0, 'YXZ');
};

/** The static parts of an arena as a three.js group (also used for the arena pictures). */
export function buildArena(arena) {
  const T = themeOf(arena), g = new THREE.Group(); g.name = 'arena-' + arena.id;
  const floorTex = checkerTex(T.floor, shade(T.floor, -0.06));
  const mats = { wall: toyMat(T.wall, { rough: 0.45 }), accent: toyMat(T.accent, { rough: 0.4 }), metal: toyMat(T.metal, { rough: 0.3, metal: 0.6 }) };
  const shapes = shapesOf(arena);
  for (const s of shapes) {
    let mesh;
    const p = arr3(s.p || s.pos || s.position), role = s.role;
    if (s.type === 'box' || s.type === 'ramp') {
      const size = arr3(s.size || s.s || [1, 1, 1]);
      const flat = size[1] <= Math.max(size[0], size[2]) * 0.4;   // a floor-like slab: checkered top
      const col = s.color === 'floor' ? null : colourOf(T, s.color, null);
      let mat = col ? toyMat(col, { rough: s.color === 'post' || s.color === 'spikes' ? 0.3 : 0.5, metal: s.color === 'spikes' ? 0.5 : 0, ...(s.color === 'lava' ? { emissive: '#ff5a00' } : {}) }) : mats[role] || (flat || s.color === 'floor' ? null : mats.wall);
      if (s.color === 'lava' && mat.emissive) mat.emissiveIntensity = 0.9;
      if (!mat) { const tex = floorTex.clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(1, size[0] / 2), Math.max(1, size[2] / 2)); const top = new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex, roughness: 0.6 }); const side = toyMat(shade(T.floor, -0.18)); mat = [side, side, top, side, side, side]; }
      mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
      if (s.type === 'ramp' && !s.rot && s.slope) mesh.rotation.x = s.slope;
    } else if (s.type === 'cyl') {
      const r = s.r ?? s.radius ?? 0.5, h = s.h ?? s.height ?? 1;
      const flat = h < r * 0.6;
      const col = colourOf(T, s.color, null);
      let mat = col && s.color !== 'floor' ? toyMat(col) : flat || s.color === 'floor' ? null : mats.accent;
      if (!mat) { const tex = floorTex.clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(1, r), Math.max(1, r)); const top = new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex, roughness: 0.6 }); const side = toyMat(shade(T.floor, -0.18)); mat = [side, top, side]; }
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(s.r2 ?? r, r, h, Math.min(72, Math.max(16, Math.round(r * 10)))), mat);
    }
    if (!mesh) continue;
    mesh.position.set(p[0], p[1], p[2]); applyRot(mesh, s.rot ?? s.rotation);
    mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
  }
  // ropes / ledges you can grab: drawn as striped ropes
  const ropeMat = toyMat(T.accent, { rough: 0.7 });
  for (const e of [].concat(Array.isArray(arena.grab) ? arena.grab : [], arena.edges || [], arena.ropes || [])) {
    const a = arr3(e.a || e.from || e.p0), b = arr3(e.b || e.to || e.p1); if (!a || !b) continue;
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), len = va.distanceTo(vb); if (len < 0.01) continue;
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(e.r || 0.06, e.r || 0.06, len, 8), ropeMat);
    rope.position.copy(va).add(vb).multiplyScalar(0.5); rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize()); rope.castShadow = true; g.add(rope);
  }
  // kill volumes: spike beds and fire pits drawn in place (the hazards that MOVE are drawn by createHazard)
  for (const k of [].concat(arena.kill || arena.kills || [])) {
    const s = shapeOf(k) || (k.p ? { ...k, type: 'box' } : null); if (!s || !s.size) continue;
    const p = arr3(s.p), size = arr3(s.size), kind = k.kind || k.type || k.how;
    if (kind === 'spikes') {
      // stand the spikes on the deadly floor of the pit when there is one, else on the bottom of the kill volume
      const floor = shapes.find(q => q.deadly && q.type === 'box' && Math.abs(arr3(q.p)[0] - p[0]) < size[0] / 2 && Math.abs(arr3(q.p)[2] - p[2]) < size[2] / 2);
      const baseY = floor ? arr3(floor.p)[1] + arr3(floor.size)[1] / 2 : p[1] - size[1] / 2;
      g.add(spikeBed(size[0] * 0.96, size[2] * 0.96, T, [p[0], baseY, p[2]], [size[0], 0, size[2]]));
    }
    else if (kind === 'fire') g.add(firePit(size[0], size[2], p, size));
  }
  // a far ground under everything so a ring-out has somewhere to look like it falls to
  const outY = arena.outY ?? arena.out?.y ?? -8;
  const under = new THREE.Mesh(new THREE.CircleGeometry(120, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: T.ground, roughness: 1 }));
  under.position.y = outY - 4; under.receiveShadow = true; g.add(under);
  g.userData.theme = T;
  return g;
}
function spikeBed(w, d, T, p, size) {
  const n = Math.max(4, Math.round(w * d * 4)), geo = new THREE.ConeGeometry(0.09, 0.42, 6);
  const im = new THREE.InstancedMesh(geo, toyMat('#d9dde3', { rough: 0.25, metal: 0.7 }), n), m = new THREE.Matrix4();
  let i = 0; const cols = Math.max(1, Math.round(Math.sqrt(n * w / Math.max(0.1, d)))), rows = Math.ceil(n / cols);
  for (let a = 0; a < cols; a++) for (let b = 0; b < rows && i < n; b++, i++) m.setPosition((a + 0.5) / cols * w - w / 2, 0.21, (b + 0.5) / rows * d - d / 2), im.setMatrixAt(i, m);
  const g = new THREE.Group(); g.add(im);
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), toyMat('#3a2a2a')); g.add(base);
  g.position.set(p[0], p[1] - size[1] / 2 + 0.03, p[2]); return g;
}
function firePit(w, d, p, size) {
  const g = new THREE.Group();
  const coals = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), new THREE.MeshStandardMaterial({ color: '#4a1a0a', emissive: '#ff4a10', emissiveIntensity: 0.9 })); g.add(coals);
  const fl = flames(Math.max(3, Math.round(w * d * 1.5)), w, d); g.add(fl); g.userData.tick = fl.userData.tick;
  g.position.set(p[0], p[1] - size[1] / 2 + 0.05, p[2]); return g;
}
const FLAME_GEO = new THREE.ConeGeometry(0.22, 0.8, 7).translate(0, 0.4, 0);
function flames(n, w, d) {
  const g = new THREE.Group(), cols = ['#ffb000', '#ff6a00', '#ffe14a'];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(FLAME_GEO, new THREE.MeshBasicMaterial({ color: cols[i % 3], transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.set((Math.random() - 0.5) * w * 0.9, 0, (Math.random() - 0.5) * d * 0.9); m.userData.ph = Math.random() * 10; g.add(m);
  }
  g.userData.tick = (t, k = 1) => { for (const m of g.children) { const f = 0.75 + 0.35 * Math.sin(t * 13 + m.userData.ph) + 0.15 * Math.sin(t * 29 + m.userData.ph * 3); m.scale.set(0.8 + 0.2 * f, Math.max(0.001, f * k), 0.8 + 0.2 * f); m.visible = k > 0.02; } };
  return g;
}

// ---- hazards -------------------------------------------------------------------------------------------------------
// Drawn from the hazard's definition (js/sim/hazards.js documents the fields) and moved from snapshot `s`, an array
// whose FIRST number is the phase: 0 calm, 1 WARNING, 2 dangerous. Every kind shows its warning plainly — a pulsing
// glow strip, sparks, a shiver, a red floor plate — so nobody is caught by something they could not see coming.
//   blade      s = [phase, rise 0..1, x, z, spin]      popspikes s = [phase, rise 0..1]     dropfloor s = [phase, dy]
//   fire       s = [phase, power 0..1]                 crusher   s = [phase, y bottom]      piston    s = [phase, ext]
//   conveyor   s = [phase, speed, scroll]              mover     s = [phase, x, y, z]       sweeper   s = [phase, angle]
const ph = s => (Array.isArray(s) ? +s[0] || 0 : 0);
const sv = (s, i) => (Array.isArray(s) ? +s[i] || 0 : +s || 0);
function createHazard(h, T) {
  const g = new THREE.Group(); g.name = 'hazard-' + h.id;
  const p = arr3(h.p || (h.path && h.path[0]) || [0, 0, 0]);
  const glowMat = toyMat(T.accent, { rough: 0.35, emissive: '#ff3020' });
  const warn = (k, t) => { glowMat.emissiveIntensity = k > 0 ? 0.25 + 1.1 * k * (0.5 + 0.5 * Math.sin(t * 22)) : 0; };
  const sparks = sparkEmitter(); g.add(sparks);
  let tick = () => {};
  const size = arr3(h.size || [2, 0.4, 2]);
  const plate = (w, d, y = 0.02) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3020', transparent: true, opacity: 0, depthWrite: false })); m.position.y = y; m.renderOrder = 3; return m; };
  switch (h.kind) {
    case 'blade': {
      const r = h.r ?? 1;
      const holder = new THREE.Group(), disc = new THREE.Group(); holder.add(disc);
      disc.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.12, 36), toyMat('#d9dde3', { rough: 0.2, metal: 0.85 })));
      for (let i = 0; i < 18; i++) { const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 4), toyMat('#eef2f6', { rough: 0.2, metal: 0.9 })); const a = i / 18 * Math.PI * 2; tooth.position.set(Math.cos(a) * (r + 0.09), 0, Math.sin(a) * (r + 0.09)); tooth.rotation.set(0, -a, -Math.PI / 2); disc.add(tooth); }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.28, r * 0.28, 0.16, 16), glowMat); disc.add(hub);
      // the disc lies in the plane across its axle: axle x -> disc faces x
      if (h.axis === 'x') holder.rotation.z = Math.PI / 2; else holder.rotation.x = Math.PI / 2;
      g.add(holder); holder.traverse(o => { o.castShadow = true; });
      // the slot in the floor it runs along
      const tr = h.track || [[p[0], p[2]], [p[0], p[2]]];
      const slotLen = Math.hypot(tr[1][0] - tr[0][0], tr[1][1] - tr[0][1]) + r * 2;
      const slot = new THREE.Mesh(new THREE.BoxGeometry(h.axis === 'x' ? 0.3 : slotLen, 0.02, h.axis === 'x' ? slotLen : 0.3), new THREE.MeshBasicMaterial({ color: '#1a1a1a' }));
      const floorY = p[1] - r * 0.05; slot.position.set((tr[0][0] + tr[1][0]) / 2, floorY + 0.02, (tr[0][1] + tr[1][1]) / 2);
      const wp = plate(h.axis === 'x' ? 1.2 : slotLen, h.axis === 'x' ? slotLen : 1.2); wp.position.copy(slot.position); wp.position.y += 0.01;
      const down = p[1] - r - 0.2, up = p[1] + r * 0.25;
      tick = (s, t) => {
        const phase = ph(s), rise = sv(s, 1);
        holder.position.set(sv(s, 2) || p[0], down + (up - down) * rise, sv(s, 3) || p[2]);
        disc.rotation.y = sv(s, 4);
        warn(phase === 1 ? 1 : phase === 2 ? 0.5 : 0, t);
        wp.material.opacity = phase === 1 ? 0.18 + 0.18 * Math.sin(t * 18) : phase === 2 ? 0.12 : 0;
        if (phase >= 1 && Math.random() < (phase === 2 ? 0.7 : 0.4)) sparks.emitAt(holder.position.x, floorY + 0.05, holder.position.z, 0.3);
      };
      g.add(slot, wp);
      break;
    }
    case 'popspikes': {
      const bed = spikeBed(size[0], size[2], T, [0, 0, 0], [size[0], 0.1, size[2]]); g.add(bed);
      const holes = new THREE.Mesh(new THREE.BoxGeometry(size[0], 0.02, size[2]), toyMat('#4a4040')); holes.position.y = 0.01; g.add(holes);
      const wp = plate(size[0], size[2], 0.03); g.add(wp);
      const base = p[1] - size[1] / 2;
      g.position.set(p[0], base, p[2]);
      tick = (s, t) => { const phase = ph(s), k = THREE.MathUtils.clamp(sv(s, 1), 0, 1); bed.position.y = -0.45 + 0.45 * Math.max(k, phase === 1 ? 0.1 + 0.05 * Math.sin(t * 40) : 0); bed.visible = k > 0.01 || phase === 1; wp.material.opacity = phase === 1 ? 0.25 + 0.25 * Math.sin(t * 20) : 0; };
      return finish();
    }
    case 'dropfloor': {
      const lid = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), [toyMat(shade(T.floor, -0.2)), toyMat(shade(T.floor, -0.2)), toyMat(shade(T.floor, 0.04)), toyMat(shade(T.floor, -0.2)), toyMat(shade(T.floor, -0.2)), toyMat(shade(T.floor, -0.2))]);
      lid.castShadow = lid.receiveShadow = true; g.add(lid);
      const stripes = new THREE.Mesh(new THREE.BoxGeometry(size[0] * 1.002, size[1] * 0.3, size[2] * 1.002), glowMat); lid.add(stripes);
      const wp = plate(size[0], size[2], size[1] / 2 + 0.015); lid.add(wp);
      g.position.set(p[0], p[1], p[2]);
      tick = (s, t) => { const phase = ph(s); lid.position.y = sv(s, 1); lid.position.x = phase === 1 ? Math.sin(t * 60) * 0.03 : 0; warn(phase === 1 ? 1 : 0, t); wp.material.opacity = phase === 1 ? 0.3 + 0.2 * Math.sin(t * 20) : 0; };
      return finish();
    }
    case 'fire': {
      // a jet: the nozzle sits on the back face of the volume and the flame fills it along `dir` (up when no dir)
      const dir = new THREE.Vector3(...arr3(h.dir || [0, 1, 0])).normalize();
      const depth = Math.abs(dir.x) * size[0] + Math.abs(dir.y) * size[1] + Math.abs(dir.z) * size[2];
      const across = Math.abs(dir.x) > 0.5 ? [size[2], size[1]] : Math.abs(dir.z) > 0.5 ? [size[0], size[1]] : [size[0], size[2]];
      const jet = new THREE.Group(); jet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); g.add(jet);
      jet.position.copy(dir).multiplyScalar(-depth / 2);
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(...across) * 0.35, Math.min(...across) * 0.45, 0.3, 14), glowMat); nozzle.position.y = 0.15; jet.add(nozzle);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(...across) * 0.5, Math.min(...across) * 0.5, 0.12, 14), toyMat(T.metal || '#888', { metal: 0.6, rough: 0.3 })); jet.add(ring);
      const fl = flames(Math.max(4, Math.round(across[0] * across[1] * 2.5)), across[0] * 0.8, across[1] * 0.8); fl.scale.y = Math.max(0.6, depth / 0.8); jet.add(fl);
      const wp = plate(size[0], size[2], -size[1] / 2 + 0.03); g.add(wp);
      g.position.set(p[0], p[1], p[2]);
      tick = (s, t) => { const phase = ph(s), k = sv(s, 1); fl.userData.tick(t, phase === 2 ? 1 : phase === 1 ? 0.08 + k * 0.6 : 0); warn(phase >= 1 ? 1 : 0, t); wp.material.opacity = phase === 1 ? 0.25 + 0.2 * Math.sin(t * 24) : phase === 2 ? 0.15 : 0;
        if (phase === 1 && Math.random() < 0.7) sparks.emitAt(p[0] - dir.x * depth / 2, p[1] - dir.y * depth / 2 + 0.1, p[2] - dir.z * depth / 2, 0.15); };
      return finish();
    }
    case 'crusher': {
      const block = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), toyMat(T.metal, { rough: 0.35, metal: 0.6 })); block.castShadow = true; g.add(block);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(size[0] * 1.01, Math.min(0.3, size[1] * 0.2), size[2] * 1.01), glowMat); stripe.position.y = -size[1] / 2 + 0.15; block.add(stripe);
      // a shadow target on the floor under it, red while it is about to slam
      const wp = plate(size[0], size[2], p[1] + 0.02); g.add(wp);
      g.position.set(p[0], 0, p[2]);
      tick = (s, t) => { const phase = ph(s), y = sv(s, 1); block.position.y = y + size[1] / 2; block.position.x = phase === 1 ? Math.sin(t * 55) * 0.04 : 0; warn(phase >= 1 ? 1 : 0, t); wp.material.opacity = phase === 1 ? 0.3 + 0.25 * Math.sin(t * 20) : phase === 2 ? 0.15 : 0; };
      return finish();
    }
    case 'piston': {
      const dir = arr3(h.dir || [1, 0, 0]);
      const ram = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), toyMat(T.metal, { rough: 0.35, metal: 0.6 })); ram.castShadow = true; g.add(ram);
      const face = new THREE.Mesh(new THREE.BoxGeometry(size[0] * 1.02, size[1] * 1.02, size[2] * 1.02), glowMat); face.scale.set(dir[0] ? 0.2 : 1, 1, dir[2] ? 0.2 : 1);
      face.position.set(dir[0] * size[0] * 0.42, 0, dir[2] * size[2] * 0.42); ram.add(face);
      g.position.set(p[0], p[1], p[2]);
      tick = (s, t) => { const phase = ph(s), ext = sv(s, 1), e = Math.max(0, ext) * (h.reach ?? 2) + Math.min(0, ext); ram.position.set(dir[0] * e, 0, dir[2] * e); warn(phase >= 1 ? 1 : 0, t); if (phase === 1 && Math.random() < 0.4) sparks.emitAt(p[0] + dir[0] * size[0] / 2, p[1], p[2] + dir[2] * size[2] / 2, 0.15); };
      return finish();
    }
    case 'conveyor': {
      const dir = arr3(h.dir || [1, 0, 0]);
      const tex = beltTex(); const along = dir[0] ? size[0] : size[2];
      tex.repeat.set(dir[0] ? along / 1.2 : 1, dir[2] ? along / 1.2 : 1);
      const top = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), side = toyMat(shade(T.metal, -0.3));
      const belt = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), [side, side, top, side, side, side]); belt.receiveShadow = true; g.add(belt);
      const ang = Math.atan2(dir[0], dir[2]);
      if (Math.abs(dir[2]) > Math.abs(dir[0])) tex.rotation = Math.PI / 2;
      const arrows = [];
      for (let i = 0; i < 3; i++) { const ar = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 3).rotateX(Math.PI / 2), toyMat(T.accent, { emissive: '#ffb000' })); ar.scale.y = 0.25; ar.rotation.y = ang; ar.position.y = size[1] / 2 + 0.03; arrows.push(ar); g.add(ar); }
      g.position.set(p[0], p[1], p[2]);
      tick = (s, t) => { const phase = ph(s), scroll = sv(s, 2); tex.offset.x = -scroll / 1.2; tex.offset.y = 0;
        arrows.forEach((ar, i) => { const u = (((scroll / along) + i / 3) % 1 + 1) % 1 - 0.5; ar.position.x = dir[0] * u * along * 0.9; ar.position.z = dir[2] * u * along * 0.9; ar.material.emissiveIntensity = phase === 2 ? 1 : phase === 1 ? 0.5 + 0.5 * Math.sin(t * 20) : 0.2; }); };
      return finish();
    }
    case 'mover': {
      const plat = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), [toyMat(shade(T.accent, -0.15)), toyMat(shade(T.accent, -0.15)), toyMat(T.accent), toyMat(shade(T.accent, -0.15)), toyMat(shade(T.accent, -0.15)), toyMat(shade(T.accent, -0.15))]);
      plat.castShadow = plat.receiveShadow = true; g.add(plat);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), glowMat); lamp.position.set(0, size[1] / 2 + 0.08, 0); plat.add(lamp);
      // the path, drawn faintly
      const path = (h.path || []).map(arr3);
      if (path.length > 1) { const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.map(q => new THREE.Vector3(q[0], q[1] - size[1] / 2 - 0.05, q[2]))), new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 0.3, gapSize: 0.25, transparent: true, opacity: 0.5 })); line.computeLineDistances(); g.add(line); }
      tick = (s, t) => { const phase = ph(s); if (Array.isArray(s) && s.length >= 4) plat.position.set(s[1], s[2], s[3]); else plat.position.set(...p); warn(phase === 1 ? 1 : phase === 2 ? 0.3 : 0, t); };
      tick([0, ...p], 0);
      return finish();
    }
    case 'sweeper': {
      const spin = new THREE.Group(); g.add(spin);
      let maxY = p[1];
      for (const arm of h.arms || [{ y: p[1], len: 4, thick: 0.35, height: 0.35, angle: 0 }]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(arm.len * 2, arm.height, arm.thick), toyMat(T.wall, { rough: 0.4 })); bar.castShadow = true;
        bar.position.y = arm.y - p[1]; bar.rotation.y = arm.angle || 0; spin.add(bar);   // +angle, the same sign as the sim (PLAN.md)
        for (let i = -4; i <= 4; i++) { if (!i) continue; const st = new THREE.Mesh(new THREE.BoxGeometry(0.18, arm.height * 1.04, arm.thick * 1.04), glowMat); st.position.x = i / 4.5 * arm.len; bar.add(st); }
        const cap = new THREE.Mesh(new THREE.SphereGeometry(arm.height * 0.8, 12, 8), glowMat); cap.position.x = arm.len; bar.add(cap); const cap2 = cap.clone(); cap2.position.x = -arm.len; bar.add(cap2);
        maxY = Math.max(maxY, arm.y);
      }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, Math.max(0.6, maxY - p[1] + 0.8), 20), toyMat(T.metal, { rough: 0.3, metal: 0.6 }));
      hub.position.y = (maxY - p[1]) / 2; hub.castShadow = true; g.add(hub);
      g.position.set(p[0], p[1], p[2]);
      tick = (s, t) => { const phase = ph(s); spin.rotation.y = sv(s, 1); warn(phase === 1 ? 1 : phase === 2 ? 0.6 : 0.1, t); };
      return finish();
    }
    default: {
      const box = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), glowMat); g.add(box); g.position.set(...p);
      tick = (s, t) => warn(ph(s) >= 1 ? 1 : 0, t);
    }
  }
  return finish();
  function finish() { g.userData.tick = (s, t, dt) => { tick(s, t, dt); sparks.update(dt); }; return g; }
}
function beltTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32; const x = c.getContext('2d');
  x.fillStyle = '#2b2f36'; x.fillRect(0, 0, 128, 32); x.fillStyle = '#3c424b';
  for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32 + 14, 16); x.lineTo(i * 32, 32); x.lineTo(i * 32 + 8, 32); x.lineTo(i * 32 + 22, 16); x.lineTo(i * 32 + 8, 0); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
const SPARK_GEO = new THREE.SphereGeometry(0.035, 5, 4);
function sparkEmitter() {
  const g = new THREE.Group(), pool = [];
  const mat = new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  g.emit = (rx, ry, rz) => {
    let s = pool.find(x => !x.visible); if (!s) { if (pool.length > 40) return null; s = new THREE.Mesh(SPARK_GEO, mat); pool.push(s); g.add(s); }
    s.visible = true; s.position.set((Math.random() - 0.5) * 2 * rx, ry, (Math.random() - 0.5) * 2 * rz); s.userData.v = new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3); s.userData.life = 0.5;
    return s;
  };
  /** A spark at a WORLD point (the emitter's group may be moved / turned). */
  g.emitAt = (x, y, z, spread = 0.1) => { const s = g.emit(spread, 0, spread); if (!s) return; g.updateWorldMatrix(true, false); const w = g.worldToLocal(new THREE.Vector3(x, y, z)); s.position.add(w); };
  g.update = dt => { for (const s of pool) if (s.visible) { s.userData.life -= dt; s.userData.v.y -= 9 * dt; s.position.addScaledVector(s.userData.v, dt); if (s.userData.life <= 0) s.visible = false; } };
  return g;
}

// ---- one-off effects -----------------------------------------------------------------------------------------------
function createFx(scene) {
  const live = [];
  const add = (obj, life, step) => { scene.add(obj); live.push({ obj, life, t: 0, step }); };
  const burstGeo = new THREE.RingGeometry(0.1, 0.22, 20);
  const starShape = (() => { const s = new THREE.Shape(); for (let i = 0; i < 16; i++) { const r = i % 2 ? 0.12 : 0.36, a = i / 16 * Math.PI * 2; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); } return new THREE.ShapeGeometry(s); })();
  const puffGeo = new THREE.SphereGeometry(0.4, 12, 8);
  return {
    punch(x, y, z, color = '#ffffff', hit = true, cam) {
      const g = new THREE.Group(); g.position.set(x, y, z); if (cam) g.quaternion.copy(cam.quaternion);
      const star = new THREE.Mesh(starShape, new THREE.MeshBasicMaterial({ color: hit ? '#ffe14a' : '#ffffff', transparent: true, depthTest: false, side: THREE.DoubleSide }));
      const ring = new THREE.Mesh(burstGeo, new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false, side: THREE.DoubleSide }));
      star.renderOrder = ring.renderOrder = 20; g.add(ring); if (hit) g.add(star);
      add(g, hit ? 0.35 : 0.22, (k) => { ring.scale.setScalar(1 + k * (hit ? 5 : 2.5)); ring.material.opacity = 1 - k; star.scale.setScalar(0.6 + k * 1.2); star.material.opacity = 1 - k; star.rotation.z = k * 2; });
    },
    poof(x, y, z) {
      const g = new THREE.Group(); g.position.set(x, y, z);
      const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true });
      const puffs = []; for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(puffGeo, mat); m.userData.d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize(); puffs.push(m); g.add(m); }
      const conf = []; const cols = ['#ff4d4d', '#3d8bff', '#ffd23f', '#3ecf5a', '#f04fd8'];
      for (let i = 0; i < 18; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.16), new THREE.MeshBasicMaterial({ color: cols[i % 5], side: THREE.DoubleSide, transparent: true })); m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 4, (Math.random() - 0.5) * 6); conf.push(m); g.add(m); }
      add(g, 1.1, (k, dt) => { for (const m of puffs) { m.position.copy(m.userData.d).multiplyScalar(0.3 + k * 1.4); m.scale.setScalar(0.6 + k * 1.6); } mat.opacity = 1 - k;
        for (const m of conf) { m.userData.v.y -= 9 * dt; m.position.addScaledVector(m.userData.v, dt); m.rotation.x += dt * 9; m.rotation.y += dt * 7; m.material.opacity = 1 - k * k; } });
    },
    soot(x, y, z) {
      const g = new THREE.Group(); g.position.set(x, y, z);
      const mat = new THREE.MeshStandardMaterial({ color: '#3a3a3a', roughness: 1, transparent: true });
      for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(puffGeo, mat); m.position.set((Math.random() - 0.5) * 0.6, i * 0.25, (Math.random() - 0.5) * 0.6); g.add(m); }
      add(g, 1.2, k => { g.position.y = y + k * 1.5; g.scale.setScalar(0.6 + k * 1.2); mat.opacity = 0.9 * (1 - k); });
    },
    spark(x, y, z, color = '#ffe14a') {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.set(x, y, z); add(m, 0.25, k => { m.scale.setScalar(1 + k * 2); m.material.opacity = 1 - k; });
    },
    whoosh(x, y, z) {
      const g = new THREE.Group(); g.position.set(x, y, z);
      for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.TorusGeometry(0.4 + i * 0.25, 0.03, 6, 24, Math.PI), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true })); m.rotation.x = Math.PI / 2; g.add(m); }
      add(g, 0.4, k => { g.rotation.y = k * 3; g.scale.setScalar(1 + k); g.children.forEach(m => { m.material.opacity = 1 - k; }); });
    },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const L = live[i]; L.t += dt; const k = Math.min(1, L.t / L.life); L.step(k, dt);
        if (k >= 1) { L.obj.removeFromParent(); L.obj.traverse(o => { if (o.material && !o.material.userData?.shared) o.material.dispose?.(); }); live.splice(i, 1); }
      }
    },
  };
}

// ---- the stage -----------------------------------------------------------------------------------------------------
export function createRenderer(canvas, { quality = pickQuality() } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(quality === 'low' ? Math.min(1, devicePixelRatio) * 0.75 : Math.min(devicePixelRatio, quality === 'medium' ? 1.5 : 2));
  renderer.shadowMap.enabled = quality !== 'low'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#1b2a4a');
  const camera = new THREE.PerspectiveCamera(36, 1, 0.3, 500);
  const hemi = new THREE.HemisphereLight('#ffffff', '#5a6a78', 1.6); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4dc', 2.4); sun.castShadow = quality !== 'low';
  sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 80 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const world = new THREE.Group(); scene.add(world);
  const fx = createFx(scene);
  const tagLayer = document.getElementById('tags');
  const R = { renderer, scene, camera, fx, quality, arena: null, arenaGroup: null, hazards: new Map(), props: new Map(), puppets: new Map(), tags: new Map(), t: 0, canvas, frameAll: true, frameMode: 'fighters', focus: null };
  const cam = { pos: new THREE.Vector3(0, 14, 16), look: new THREE.Vector3(0, 0, 0), wantPos: new THREE.Vector3(0, 14, 16), wantLook: new THREE.Vector3(), snap: true };

  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); window.visualViewport?.addEventListener('resize', resize); resize();

  /** Show an arena (null = an empty backdrop for the menus). */
  R.setArena = arena => {
    if (R.arenaGroup) { disposeTree(R.arenaGroup); R.arenaGroup = null; }
    for (const g of R.hazards.values()) disposeTree(g);
    for (const g of R.props.values()) disposeTree(g);
    R.hazards.clear(); R.props.clear(); R.arena = arena;
    if (!arena) { scene.background = skyTex(['#1b1f4a', '#3a2a6a']); scene.fog = null; return; }
    R.arenaGroup = buildArena(arena); world.add(R.arenaGroup);
    const T = R.arenaGroup.userData.theme;
    scene.background = skyTex(T.sky); scene.fog = new THREE.Fog(T.fog, 45, 150); sun.color.set(T.light);
    if (arena.cam?.fov) { camera.fov = arena.cam.fov * 0.85; camera.updateProjectionMatrix(); }
    for (const pr of [].concat(arena.props || [])) { const m = propMesh(pr, T); R.props.set(String(pr.id), m); world.add(m); }
    for (const h of [].concat(arena.hazards || [])) { const g = createHazard(h, T); R.hazards.set(String(h.id), g); world.add(g); }
    cam.snap = true;
  };

  /** Make sure there is a puppet for each fighter; drop the ones that are gone. `looks`: pid -> { look, color, name }. */
  R.syncFighters = async (fighters, looks) => {
    const want = new Set(fighters.map(f => f.pid));
    for (const [pid, P] of R.puppets) if (!want.has(pid)) { P.dispose(); R.puppets.delete(pid); R.tags.get(pid)?.el.remove(); R.tags.delete(pid); }
    const jobs = [];
    for (const f of fighters) {
      if (R.puppets.has(f.pid) || R.puppets.get('pending' + f.pid)) continue;
      const info = looks(f) || {};
      R.puppets.set('pending' + f.pid, true);
      jobs.push(createPuppet(f, { look: info.look, color: info.color }).then(P => {
        R.puppets.delete('pending' + f.pid);
        if (R.disposedSet) { P.dispose(); return; }
        world.add(P.group); world.add(P.ring); world.add(P.stars); R.puppets.set(f.pid, P);
        if (tagLayer && info.name) {
          const el = document.createElement('div'); el.className = 'tag'; el.style.setProperty('--seat', info.color || '#fff');
          el.innerHTML = `<span class="nm"></span><i class="daze"><b></b></i>`; el.querySelector('.nm').textContent = info.name; tagLayer.append(el);
          R.tags.set(f.pid, { el, bar: el.querySelector('.daze b') });
        }
      }));
    }
    await Promise.all(jobs);
  };
  R.clearFighters = () => { for (const [k, P] of R.puppets) if (typeof P === 'object') P.dispose(); R.puppets.clear(); for (const T of R.tags.values()) T.el.remove(); R.tags.clear(); };

  const lerp = (a, b, k) => a + (b - a) * k;
  const lerp3 = (a, b, k) => (a && b ? [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)] : (b || a));
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  /** One fighter between two snapshots. */
  function blendFighter(fa, fb, k) {
    if (!fa) return fb;
    qa.set(fa.torso[3], fa.torso[4], fa.torso[5], fa.torso[6]); qb.set(fb.torso[3], fb.torso[4], fb.torso[5], fb.torso[6]); qa.slerp(qb, k);
    // a teleport (respawn) is not blended
    if (Math.hypot(fa.torso[0] - fb.torso[0], fa.torso[2] - fb.torso[2]) > 3) return fb;
    return { ...fb, torso: [...lerp3(fa.torso, fb.torso, k), qa.x, qa.y, qa.z, qa.w], head: lerp3(fa.head, fb.head, k),
      hands: [lerp3(fa.hands?.[0], fb.hands?.[0], k), lerp3(fa.hands?.[1], fb.hands?.[1], k)], feet: [lerp3(fa.feet?.[0], fb.feet?.[0], k), lerp3(fa.feet?.[1], fb.feet?.[1], k)] };
  }
  const v = new THREE.Vector3();
  /** Draw a match frame from { a, b, k } snapshots. */
  R.drawMatch = ({ a, b, k }, dt) => {
    R.t += dt;
    const byA = new Map((a?.fighters || []).map(f => [f.pid, f]));
    const live = [];
    for (const fb of b.fighters || []) {
      const P = R.puppets.get(fb.pid); if (!P || typeof P !== 'object') continue;
      const f = blendFighter(byA.get(fb.pid), fb, k);
      const show = f.alive !== false;
      P.setVisible(show);
      if (show) { P.update(f, dt); live.push(f); }
      const T = R.tags.get(fb.pid);
      if (T) {
        if (!show) T.el.style.display = 'none';
        else {
          v.copy(P.headPos()); v.y += 0.55; v.project(camera);
          if (v.z > 1) T.el.style.display = 'none';
          else { T.el.style.display = ''; T.el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2 * canvas.clientWidth).toFixed(1)}px, ${((1 - v.y) / 2 * canvas.clientHeight).toFixed(1)}px)`; }
          T.bar.style.width = Math.round((f.down > 0 ? 1 : f.daze || 0) * 100) + '%';
          T.el.classList.toggle('down', f.down > 0); T.el.classList.toggle('dazed', (f.daze || 0) >= 0.66);
        }
      }
    }
    const hb = new Map((b.hazards || []).map(h => [String(h.id), h])), ha = new Map((a?.hazards || []).map(h => [String(h.id), h]));
    for (const [id, g] of R.hazards) {
      const h1 = hb.get(id); if (!h1) continue;
      const h0 = ha.get(id); let s = h1.s;
      if (h0 && typeof h0.s === 'number' && typeof s === 'number' && Math.abs(s - h0.s) < 2) s = lerp(h0.s, s, k);
      g.userData.tick(s, R.t, dt);
    }
    for (const g of R.arenaGroup?.children || []) g.userData.tick?.(R.t, 1);
    const pa = new Map((a?.props || []).map(q => [String(q.id), q]));
    for (const q of b.props || []) {
      const m = R.props.get(String(q.id)); if (!m || !q.p) continue;
      const q0 = pa.get(String(q.id))?.p, P1 = q.p;
      if (q0 && Math.hypot(q0[0] - P1[0], q0[2] - P1[2]) < 3) { m.position.set(lerp(q0[0], P1[0], k), lerp(q0[1], P1[1], k), lerp(q0[2], P1[2], k)); qa.set(q0[3], q0[4], q0[5], q0[6]); qb.set(P1[3], P1[4], P1[5], P1[6]); m.quaternion.copy(qa.slerp(qb, k)); }
      else { m.position.set(P1[0], P1[1], P1[2]); m.quaternion.set(P1[3], P1[4], P1[5], P1[6]); }
      m.visible = q.out !== true && P1[1] > (R.arena?.outY ?? -8) - 3;
    }
    if (R.frameAll) frameFighters(live, dt);
  };

  /** Fly the camera so every live fighter is in the picture (it pulls back as they spread out). */
  function frameFighters(live, dt) {
    if (R.focus != null) { const one = live.filter(f => f.pid === R.focus); if (one.length) live = one; }      // close-up on one fighter (tests, a future replay)
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, y = 0;
    const pts = live.length ? live.map(f => f.torso) : (R.arena?.spawns || [[0, 0, 0]]).map(arr3);
    for (const p of pts) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]); y += p[1]; }
    y /= pts.length;
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const hint = R.arena?.cam || {};
    const hp = hint.pos && hint.look ? Math.atan2(hint.pos[1] - hint.look[1], Math.hypot(hint.pos[2] - hint.look[2], hint.pos[0] - hint.look[0])) : null;
    const full = hint.pos && hint.look ? Math.hypot(hint.pos[0] - hint.look[0], hint.pos[1] - hint.look[1], hint.pos[2] - hint.look[2]) : 30;
    const pitch = hp ?? 52 * Math.PI / 180, fov = camera.fov * Math.PI / 180;
    const pad = R.focus != null ? 0.6 : 2.2, halfW = Math.max(R.focus != null ? 1 : 3.2, (maxX - minX) / 2 + pad), halfD = Math.max(R.focus != null ? 0.8 : 2.6, (maxZ - minZ) / 2 + pad);
    const dW = halfW / Math.tan(fov / 2) / Math.max(0.5, camera.aspect), dD = (halfD * Math.sin(pitch) + 1.4) / Math.tan(fov / 2);
    let d = THREE.MathUtils.clamp(Math.max(dW, dD) * 1.05, R.focus != null ? 3.5 : full * 0.7, Math.max(full * 1.3, 14));
    if (R.frameMode === 'arena' && hint.pos) { d = full * (camera.aspect < 1 ? 1.6 : 1.05); cam.wantLook.set(...hint.look); cam.wantPos.set(hint.look[0] + (hint.pos[0] - hint.look[0]) * d / full, hint.look[1] + (hint.pos[1] - hint.look[1]) * d / full, hint.look[2] + (hint.pos[2] - hint.look[2]) * d / full); const kk = cam.snap ? 1 : 1 - Math.exp(-dt * 2.6); cam.snap = false; cam.pos.lerp(cam.wantPos, kk); cam.look.lerp(cam.wantLook, kk); return; }
    cam.wantLook.set(cx, Math.max(y - 0.6, (hint.look?.[1] ?? 0) - 0.5), cz + 0.4);
    cam.wantPos.set(cx, cam.wantLook.y + Math.sin(pitch) * d, cam.wantLook.z + Math.cos(pitch) * d);
    const kk = cam.snap ? 1 : 1 - Math.exp(-dt * 2.6); cam.snap = false;
    cam.pos.lerp(cam.wantPos, kk); cam.look.lerp(cam.wantLook, kk);
  }
  /** A fixed camera on a point (the builder / lobby). */
  R.lookAt = (pos, look, { instant = false } = {}) => { cam.wantPos.set(...pos); cam.wantLook.set(...look); if (instant) cam.snap = true; };
  R.render = dt => {
    if (!R.frameAll) { const kk = cam.snap ? 1 : 1 - Math.exp(-dt * 5); cam.snap = false; cam.pos.lerp(cam.wantPos, kk); cam.look.lerp(cam.wantLook, kk); }
    camera.position.copy(cam.pos); camera.lookAt(cam.look);
    sun.target.position.copy(cam.look); sun.position.copy(cam.look).add(v.set(-10, 22, 12));
    fx.update(dt);
    renderer.render(scene, camera);
  };
  R.toScreen = (x, y, z) => { v.set(x, y, z).project(camera); return { x: (v.x + 1) / 2 * canvas.clientWidth, y: (1 - v.y) / 2 * canvas.clientHeight, behind: v.z > 1 }; };
  R.world = world;

  /** A picture of an arena (data URL), drawn off screen with the same builder. Cached per arena id. */
  const thumbs = new Map();
  R.arenaPicture = (arena, w = 320, h = 200) => {
    if (thumbs.has(arena.id)) return thumbs.get(arena.id);
    let url = '';
    try {
      const sc = new THREE.Scene(), grp = buildArena(arena), T = grp.userData.theme; sc.add(grp);
      for (const hz of [].concat(arena.hazards || [])) { const g = createHazard(hz, T); g.userData.tick(hz.kind === 'fire' ? [2, 1] : hz.kind === 'blade' ? [2, 1, hz.p[0], hz.p[2], 0.5] : hz.kind === 'popspikes' ? [2, 1] : hz.kind === 'mover' ? [0, ...arr3(hz.path?.[0] || hz.p)] : hz.kind === 'crusher' ? [0, hz.p[1] + (hz.lift || 2)] : [0, 0.6, 0], 0.3, 1 / 60); sc.add(g); }
      sc.background = skyTex(T.sky);
      for (const pr of [].concat(arena.props || [])) sc.add(propMesh(pr, T));
      sc.add(new THREE.HemisphereLight('#ffffff', '#5a6a78', 1.7)); const s2 = new THREE.DirectionalLight('#fff4dc', 2.2); s2.position.set(-8, 20, 10); sc.add(s2);
      const under = grp.children[grp.children.length - 1]; under.visible = false;
      const box = new THREE.Box3().setFromObject(grp); under.visible = true;
      const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()), r = Math.max(sz.x, sz.z) * 0.62 + 1;
      const pc = new THREE.PerspectiveCamera(arena.cam?.fov || 40, w / h, 0.3, 400);
      if (arena.cam?.pos && arena.cam?.look) { const L = arena.cam.look, P = arena.cam.pos; pc.position.set(L[0] + (P[0] - L[0]) * 1.1, L[1] + (P[1] - L[1]) * 1.1, L[2] + (P[2] - L[2]) * 1.1); pc.lookAt(L[0], L[1], L[2]); }
      else { pc.position.set(c.x, c.y + r * 1.25, c.z + r * 1.15); pc.lookAt(c.x, c.y, c.z); }
      const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
      const shadowWas = renderer.shadowMap.enabled; renderer.shadowMap.enabled = false;
      renderer.setRenderTarget(rt); renderer.render(sc, pc); renderer.setRenderTarget(null); renderer.shadowMap.enabled = shadowWas;
      const px = new Uint8Array(w * h * 4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g2 = cv.getContext('2d'), img = g2.createImageData(w, h);
      for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      g2.putImageData(img, 0, 0); url = cv.toDataURL('image/jpeg', 0.82);
      rt.dispose(); disposeTree(grp);
    } catch (e) { console.warn('[knockabout] arena picture failed', e); }
    thumbs.set(arena.id, url);
    return url;
  };
  return R;
}
const skyCache = new Map();
function skyTex(cols) {
  const key = cols.join(); if (skyCache.has(key)) return skyCache.get(key);
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, cols[0]); gr.addColorStop(1, cols[cols.length - 1]); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.shared = true; skyCache.set(key, t); return t;
}
/** A loose prop (crate / ball / barrel), drawn from its definition and moved from snapshot.props. */
function propMesh(d, T) {
  let geo;
  if (d.kind === 'ball') geo = new THREE.SphereGeometry(d.r || 0.4, 20, 14);
  else if (d.kind === 'barrel') geo = new THREE.CylinderGeometry(d.r || 0.35, d.r || 0.35, d.h || 0.9, 16);
  else { const sz = d.size || [0.8, 0.8, 0.8]; geo = new THREE.BoxGeometry(sz[0], sz[1], sz[2]); }
  const col = d.kind === 'ball' ? '#ff5f5f' : d.kind === 'barrel' ? '#d9822b' : '#c8955a';
  const m = new THREE.Mesh(geo, toyMat(col, { rough: 0.6 }));
  if (d.kind === 'ball') { const band = new THREE.Mesh(new THREE.TorusGeometry((d.r || 0.4) * 1.0, (d.r || 0.4) * 0.12, 8, 24), toyMat('#ffffff')); m.add(band); }
  if (d.kind === 'crate' || !d.kind || d.kind === 'box') { const sz = d.size || [0.8, 0.8, 0.8]; const x = new THREE.Mesh(new THREE.BoxGeometry(sz[0] * 1.02, sz[1] * 0.18, sz[2] * 1.02), toyMat('#8a5a32')); m.add(x); }
  if (d.kind === 'barrel') for (const y of [-0.3, 0.3]) { const hoop = new THREE.Mesh(new THREE.TorusGeometry((d.r || 0.35) * 1.02, 0.03, 6, 20), toyMat('#3a3a3a', { metal: 0.5 })); hoop.rotation.x = Math.PI / 2; hoop.position.y = y * (d.h || 0.9); m.add(hoop); }
  m.traverse(o => { o.castShadow = o.receiveShadow = true; });
  m.position.set(...arr3(d.p)); m.name = 'prop-' + d.id;
  return m;
}
export function disposeTree(g) {
  g.removeFromParent();
  g.traverse(o => { if (o.geometry && !o.geometry.userData?.shared && o.geometry !== FLAME_GEO && o.geometry !== SPARK_GEO) o.geometry.dispose?.(); for (const m of [].concat(o.material || [])) { m.map?.dispose?.(); m.dispose?.(); } });
}
