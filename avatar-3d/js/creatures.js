// Procedural Mii-style creatures (non-humanoid) from Three.js primitives: quadrupeds, a spider, a bat, a snake,
// and winged dragons. Same interface as createMiiCharacter: { group, update(dt,t), setAnim(name), setSpec(spec), dispose() }.
//
// Creature JSON (a character document can carry it as `creature`; when present, use it instead of `avatar` for 3D):
//   { type: 'wolf' | 'dire_wolf' | 'boar' | 'bear' | 'rat' | 'horse' | 'deer' | 'bat' | 'spider' | 'snake' | 'drake' | 'dragon',
//     size: 1 (scale multiplier), colors: { body, belly, accent, eyes }, features: { horns, wings, tail, mane, tusks, spikes } (overrides), seed }
// Animations: idle · walk · run · attack (lunge/bite) · dead · talk (mouth open, for growls) · fly (bat/dragon)
import * as THREE from 'three';
import { shade } from '../../avatar-2d/js/render.js';

function mat(color, extra = {}) { return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.9, metalness: 0, ...extra }); }
function mesh(geo, color) { const m = new THREE.Mesh(geo, mat(color)); m.castShadow = true; m.receiveShadow = false; return m; }
const sphere = (r, c, s = 18) => mesh(new THREE.SphereGeometry(r, s, s), c);
const capsule = (r, l, c) => mesh(new THREE.CapsuleGeometry(r, l, 5, 12), c);
const cone = (r, h, c, s = 12) => mesh(new THREE.ConeGeometry(r, h, s), c);
const cyl = (rt, rb, h, c, s = 12) => mesh(new THREE.CylinderGeometry(rt, rb, h, s), c);
const box = (w, h, d, c) => mesh(new THREE.BoxGeometry(w, h, d), c);
const rng = seed => { let a = (seed ?? 1) >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/** Type catalog: body plan + proportions + default colours + feature flags. Sizes in metres for size 1. */
export const CREATURE_TYPES = {
  wolf:      { plan: 'quad', label: 'Wolf', body: { len: 0.9, r: 0.2, legLen: 0.45, legR: 0.055, headR: 0.17, snout: [0.09, 0.22], neck: 0.12, tail: { len: 0.45, r: 0.05, up: -0.3 } }, ears: 'pointed', colors: { body: '#6b6b70', belly: '#b9b4a8', accent: '#3a3a40', eyes: '#f2c14e' }, features: { fangs: true } },
  dire_wolf: { plan: 'quad', label: 'Dire wolf', body: { len: 1.2, r: 0.27, legLen: 0.6, legR: 0.075, headR: 0.22, snout: [0.11, 0.28], neck: 0.16, tail: { len: 0.55, r: 0.06, up: -0.2 } }, ears: 'pointed', colors: { body: '#2f2f36', belly: '#5a5a62', accent: '#1a1a1e', eyes: '#ff5a3a' }, features: { fangs: true, spikes: true } },
  boar:      { plan: 'quad', label: 'Boar', body: { len: 0.85, r: 0.27, legLen: 0.32, legR: 0.055, headR: 0.2, snout: [0.12, 0.2], neck: 0.02, tail: { len: 0.2, r: 0.02, up: 0.6 } }, ears: 'round', colors: { body: '#5a4632', belly: '#7a6650', accent: '#2e2418', eyes: '#2a1a10' }, features: { tusks: true, mane: true } },
  bear:      { plan: 'quad', label: 'Bear', body: { len: 1.2, r: 0.42, legLen: 0.5, legR: 0.11, headR: 0.26, snout: [0.11, 0.16], neck: 0.05, tail: { len: 0.08, r: 0.04, up: 0.2 } }, ears: 'round', colors: { body: '#4a3524', belly: '#6a5238', accent: '#2a1c10', eyes: '#1a1008' }, features: { claws: true } },
  rat:       { plan: 'quad', label: 'Rat', body: { len: 0.45, r: 0.12, legLen: 0.12, legR: 0.02, headR: 0.1, snout: [0.05, 0.14], neck: 0.0, tail: { len: 0.5, r: 0.015, up: -0.1, bare: true } }, ears: 'round', colors: { body: '#7a7068', belly: '#b8aca0', accent: '#d8a0a0', eyes: '#111' }, features: { whiskers: true } },
  horse:     { plan: 'quad', label: 'Horse', body: { len: 1.3, r: 0.3, legLen: 0.85, legR: 0.055, headR: 0.17, snout: [0.11, 0.3], neck: 0.5, neckUp: 0.9, tail: { len: 0.6, r: 0.06, up: -0.6, hair: true } }, ears: 'pointed', colors: { body: '#7a4a2a', belly: '#8a5a3a', accent: '#2a1a10', eyes: '#1a1008' }, features: { mane: true, hooves: true } },
  deer:      { plan: 'quad', label: 'Deer', body: { len: 1.0, r: 0.22, legLen: 0.8, legR: 0.035, headR: 0.14, snout: [0.08, 0.2], neck: 0.4, neckUp: 1.0, tail: { len: 0.1, r: 0.03, up: 0.8 } }, ears: 'pointed', colors: { body: '#a8763e', belly: '#e8d8b8', accent: '#5a3a1a', eyes: '#1a1008' }, features: { antlers: true, hooves: true } },
  drake:     { plan: 'quad', label: 'Mire drake', body: { len: 1.1, r: 0.25, legLen: 0.35, legR: 0.07, headR: 0.2, snout: [0.12, 0.34], neck: 0.3, neckUp: 0.4, tail: { len: 0.9, r: 0.08, up: -0.15, spiky: true } }, ears: 'none', colors: { body: '#4a6a3a', belly: '#b8b878', accent: '#2a3a20', eyes: '#e8e040' }, features: { horns: true, spikes: true, fangs: true } },
  dragon:    { plan: 'quad', label: 'Dragon', body: { len: 1.6, r: 0.36, legLen: 0.6, legR: 0.1, headR: 0.28, snout: [0.16, 0.42], neck: 0.6, neckUp: 0.8, tail: { len: 1.4, r: 0.12, up: -0.1, spiky: true } }, ears: 'none', colors: { body: '#8a2a2a', belly: '#e0b070', accent: '#3a1010', eyes: '#ffd040' }, features: { horns: true, wings: true, spikes: true, fangs: true } },
  spider:    { plan: 'spider', label: 'Giant spider', body: { abdomenR: 0.32, thoraxR: 0.18, legLen: 0.55, legR: 0.025, headR: 0.12 }, colors: { body: '#2a2a30', belly: '#3a2a3a', accent: '#8a2020', eyes: '#e02020' }, features: { fangs: true } },
  bat:       { plan: 'bat', label: 'Bat', body: { r: 0.12, span: 0.9, headR: 0.09 }, ears: 'pointed', colors: { body: '#3a2a3a', belly: '#5a4a5a', accent: '#1a1018', eyes: '#ff9040' }, features: { fangs: true, wings: true } },
  snake:     { plan: 'snake', label: 'Snake', body: { len: 2.0, r: 0.09, segs: 14, headR: 0.12 }, colors: { body: '#4a7a3a', belly: '#c8c880', accent: '#2a4a1a', eyes: '#f0e040' }, features: { fangs: true } },
};
export const CREATURE_ANIMS = ['idle', 'walk', 'run', 'attack', 'talk', 'dead', 'fly'];

export function normalizeCreature(spec = {}) {
  const type = CREATURE_TYPES[spec.type] ? spec.type : 'wolf'; const T = CREATURE_TYPES[type];
  return { type, size: spec.size ?? 1, colors: { ...T.colors, ...(spec.colors || {}) }, features: { ...T.features, ...(spec.features || {}) }, seed: spec.seed ?? 1 };
}
/** Random colour variation for a type (kept in the type's family so wolves still look like wolves). */
export function randomCreature(type, seed = Math.floor(Math.random() * 1e9)) {
  const r = rng(seed); const T = CREATURE_TYPES[type] || CREATURE_TYPES.wolf; const jitter = (hex, amt) => shade(hex, (r() - 0.5) * amt);
  const hueShift = (hex, deg) => { const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl); c.setHSL((hsl.h + deg / 360 + 1) % 1, hsl.s, hsl.l); return '#' + c.getHexString(); };
  const bodyC = hueShift(jitter(T.colors.body, 0.5), (r() - 0.5) * (type === 'dragon' || type === 'drake' ? 120 : 24));
  return normalizeCreature({ type, size: +(0.85 + r() * 0.3).toFixed(2), seed, colors: { body: bodyC, belly: jitter(T.colors.belly, 0.4), accent: shade(bodyC, -0.45), eyes: r() < 0.15 ? '#ff3030' : T.colors.eyes } });
}

/** Build a creature. */
export async function createCreature(spec) {
  const group = new THREE.Group(); group.userData.character = true;
  const state = { anim: 'idle', t: 0, spec: null, parts: {}, plan: null, root: null };
  function clear() { while (group.children.length) { disposeObj(group.children[0]); group.remove(group.children[0]); } }
  function disposeObj(o) { o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); }
  function build(sp) {
    const s = normalizeCreature(sp); state.spec = s; clear(); const T = CREATURE_TYPES[s.type]; state.plan = T.plan;
    const root = new THREE.Group(); root.scale.setScalar(s.size); group.add(root); state.root = root;
    state.parts = ({ quad: buildQuad, spider: buildSpider, bat: buildBat, snake: buildSnake })[T.plan](root, T, s);
  }
  build(spec);
  return {
    group, get anim() { return state.anim; }, setAnim(n) { state.anim = n; state.t = 0; }, setSpec(sp) { build(sp); }, get spec() { return state.spec; },
    metrics() { const b = new THREE.Box3().setFromObject(group); return { height: b.max.y - b.min.y, length: b.max.z - b.min.z, width: b.max.x - b.min.x }; },
    update(dt, t) { state.t += dt; const fn = ({ quad: animQuad, spider: animSpider, bat: animBat, snake: animSnake })[state.plan]; if (fn) fn(state, dt); },
    dispose() { clear(); },
  };
}

// ------------------------------------------------------------------ quadruped (faces +z)
function buildQuad(root, T, s) {
  const B = T.body, C = s.colors, F = s.features; const P = {};
  const bodyY = B.legLen + B.r * 0.9; const hip = new THREE.Group(); hip.position.y = bodyY; root.add(hip); P.hip = hip; P.bodyY = bodyY;
  const torso = capsule(B.r, B.len - B.r * 2, C.body); torso.rotation.x = Math.PI / 2; hip.add(torso);
  const belly = capsule(B.r * 0.8, B.len - B.r * 2.2, C.belly); belly.rotation.x = Math.PI / 2; belly.position.y = -B.r * 0.35; hip.add(belly);
  if (F.mane) { const mane = capsule(B.r * 1.05, B.len * 0.35, C.accent); mane.rotation.x = Math.PI / 2; mane.position.set(0, B.r * 0.25, B.len * 0.22); hip.add(mane); }
  if (F.spikes) for (let i = 0; i < 5; i++) { const sp = cone(B.r * 0.18, B.r * 0.5, C.accent, 6); sp.position.set(0, B.r * 0.95, B.len * 0.4 - i * B.len * 0.2); hip.add(sp); }
  // legs: pivots at the shoulder/hip, hanging down
  P.legs = [];
  const legX = B.r * 0.6, frontZ = B.len * 0.36, backZ = -B.len * 0.36;
  for (const [x, z, tag] of [[-legX, frontZ, 'FL'], [legX, frontZ, 'FR'], [-legX, backZ, 'BL'], [legX, backZ, 'BR']]) {
    const pivot = new THREE.Group(); pivot.position.set(x, -B.r * 0.4, z); hip.add(pivot);
    const upper = capsule(B.legR * 1.15, B.legLen * 0.45, C.body); upper.position.y = -B.legLen * 0.25; pivot.add(upper);
    const knee = new THREE.Group(); knee.position.y = -B.legLen * 0.5; pivot.add(knee);
    const lower = capsule(B.legR, B.legLen * 0.42, shade(C.body, -0.1)); lower.position.y = -B.legLen * 0.25; knee.add(lower);
    const paw = F.hooves ? cyl(B.legR * 1.2, B.legR * 1.4, B.legR * 1.6, C.accent, 10) : sphere(B.legR * 1.5, F.claws ? C.accent : shade(C.body, -0.2), 10); paw.position.set(0, -B.legLen * 0.5 + B.legR * 0.6, B.legR * 0.4); paw.scale.set(1, 0.7, 1.3); knee.add(paw);
    P.legs.push({ pivot, knee, tag, front: tag[0] === 'F', left: tag[1] === 'L' });
  }
  // neck + head
  const neck = new THREE.Group(); neck.position.set(0, B.r * 0.3, B.len / 2 - B.r * 0.2); hip.add(neck); P.neck = neck;
  const neckUp = B.neckUp ?? 0.35; const neckLen = B.neck;
  if (neckLen > 0.05) { const n = capsule(B.r * 0.55, neckLen, C.body); n.rotation.x = Math.PI / 2 - neckUp; n.position.set(0, Math.sin(neckUp) * neckLen / 2, Math.cos(neckUp) * neckLen / 2); neck.add(n); }
  const head = new THREE.Group(); head.position.set(0, Math.sin(neckUp) * neckLen + B.headR * 0.3, Math.cos(neckUp) * neckLen + B.headR * 0.4); neck.add(head); P.head = head;
  const skull = sphere(B.headR, C.body); head.add(skull);
  const [sr, sl] = B.snout; const snout = capsule(sr, sl - sr, C.body); snout.rotation.x = Math.PI / 2; snout.position.set(0, -B.headR * 0.25, B.headR * 0.6 + sl / 2 - sr / 2); head.add(snout);
  const nose = sphere(sr * 0.45, C.accent, 8); nose.position.set(0, -B.headR * 0.12, B.headR * 0.6 + sl - sr * 0.2); head.add(nose);
  const jaw = new THREE.Group(); jaw.position.set(0, -B.headR * 0.45, B.headR * 0.5); head.add(jaw); P.jaw = jaw;
  const jawM = capsule(sr * 0.8, sl * 0.7, shade(C.body, -0.12)); jawM.rotation.x = Math.PI / 2; jawM.position.set(0, -sr * 0.2, sl * 0.4); jaw.add(jawM);
  if (F.fangs) for (const x of [-1, 1]) { const f = cone(sr * 0.14, sr * 0.5, '#f4f0e0', 6); f.rotation.x = Math.PI; f.position.set(x * sr * 0.45, -B.headR * 0.5, B.headR * 0.6 + sl * 0.75); head.add(f); }
  if (F.tusks) for (const x of [-1, 1]) { const tk = cone(sr * 0.2, sr * 1.2, '#f0e8d0', 6); tk.position.set(x * sr * 0.7, -B.headR * 0.35, B.headR * 0.6 + sl * 0.6); tk.rotation.set(-0.6, 0, x * -0.4); head.add(tk); }
  for (const x of [-1, 1]) { const eye = sphere(B.headR * 0.16, C.eyes, 10); eye.position.set(x * B.headR * 0.45, B.headR * 0.2, B.headR * 0.75); head.add(eye); const pupil = sphere(B.headR * 0.07, '#111', 8); pupil.position.set(x * B.headR * 0.47, B.headR * 0.22, B.headR * 0.88); head.add(pupil); }
  if (T.ears === 'pointed') for (const x of [-1, 1]) { const e = cone(B.headR * 0.28, B.headR * 0.6, C.body, 8); e.position.set(x * B.headR * 0.55, B.headR * 0.9, -B.headR * 0.1); e.rotation.z = x * -0.3; head.add(e); const inner = cone(B.headR * 0.16, B.headR * 0.4, C.belly, 8); inner.position.set(x * B.headR * 0.55, B.headR * 0.85, -B.headR * 0.02); inner.rotation.z = x * -0.3; head.add(inner); }
  else if (T.ears === 'round') for (const x of [-1, 1]) { const e = sphere(B.headR * 0.28, C.body, 10); e.position.set(x * B.headR * 0.7, B.headR * 0.7, -B.headR * 0.1); head.add(e); const inner = sphere(B.headR * 0.16, C.belly, 8); inner.position.set(x * B.headR * 0.72, B.headR * 0.72, B.headR * 0.02); head.add(inner); }
  if (F.horns) for (const x of [-1, 1]) { const h = cone(B.headR * 0.18, B.headR * 1.1, C.accent, 7); h.position.set(x * B.headR * 0.5, B.headR * 0.9, -B.headR * 0.3); h.rotation.set(-0.7, 0, x * -0.35); head.add(h); }
  if (F.antlers) for (const x of [-1, 1]) { const a = new THREE.Group(); a.position.set(x * B.headR * 0.45, B.headR * 0.8, -B.headR * 0.2); a.rotation.z = x * -0.35; head.add(a); const main = cyl(0.012, 0.02, B.headR * 2.2, C.accent, 6); main.position.y = B.headR * 1.1; a.add(main); for (let i = 1; i <= 3; i++) { const tine = cyl(0.008, 0.015, B.headR * 0.8, C.accent, 6); tine.position.set(x * B.headR * 0.25, B.headR * (0.5 + i * 0.5), 0); tine.rotation.z = x * -0.9; a.add(tine); } }
  if (F.whiskers) for (const x of [-1, 1]) for (const dy of [-0.02, 0.02]) { const w = cyl(0.003, 0.003, sr * 3, '#ddd', 4); w.rotation.z = Math.PI / 2; w.rotation.y = x * 0.3; w.position.set(x * sr * 1.2, -B.headR * 0.15 + dy, B.headR * 0.6 + sl * 0.8); head.add(w); }
  // tail
  const tailPivot = new THREE.Group(); tailPivot.position.set(0, B.r * 0.4, -B.len / 2 + B.r * 0.3); hip.add(tailPivot); P.tail = tailPivot;
  const tl = B.tail; const segs = tl.len > 0.5 ? 4 : 2; let parent = tailPivot; P.tailSegs = [];
  for (let i = 0; i < segs; i++) { const seg = new THREE.Group(); const l = tl.len / segs; const r = tl.r * (1 - i / (segs + 1)); const m = capsule(r, l, tl.bare ? C.accent : (tl.hair ? C.accent : C.body)); m.rotation.x = Math.PI / 2; m.position.z = -l / 2; seg.add(m); if (tl.spiky) { const sp = cone(r * 0.6, r * 1.6, C.accent, 5); sp.position.set(0, r * 0.9, -l / 2); seg.add(sp); } seg.rotation.x = (i === 0 ? tl.up : tl.up * 0.35); parent.add(seg); seg.position.z = i === 0 ? 0 : -(tl.len / segs); parent = seg; P.tailSegs.push(seg); }
  if (tl.spiky && s.type === 'dragon') { const tip = cone(tl.r * 1.2, tl.r * 3, C.accent, 4); tip.rotation.x = Math.PI / 2; tip.position.z = -(tl.len / segs) - tl.r * 1.2; parent.add(tip); }
  // wings
  if (F.wings) { P.wings = []; for (const x of [-1, 1]) { const w = new THREE.Group(); w.position.set(x * B.r * 0.7, B.r * 0.7, B.len * 0.1); hip.add(w); const span = B.len * 0.9; const bone = cyl(0.03, 0.03, span, C.accent, 6); bone.rotation.z = x * -Math.PI / 2 + 0; bone.position.x = x * span / 2; w.add(bone); const membrane = mesh(new THREE.ShapeGeometry(wingShape(span, x)), C.belly); membrane.material.side = THREE.DoubleSide; membrane.material.transparent = true; membrane.material.opacity = 0.92; membrane.rotation.x = Math.PI / 2; w.add(membrane); P.wings.push({ group: w, side: x }); } }
  P.type = s.type; return P;
}
/** Bat-style membrane: leading edge along the bone, scalloped trailing edge between three finger tips. */
function wingShape(span, x) { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(x * span, -span * 0.02); sh.quadraticCurveTo(x * span * 0.85, -span * 0.2, x * span * 0.78, -span * 0.5); sh.quadraticCurveTo(x * span * 0.62, -span * 0.32, x * span * 0.48, -span * 0.58); sh.quadraticCurveTo(x * span * 0.32, -span * 0.36, x * span * 0.16, -span * 0.5); sh.quadraticCurveTo(x * span * 0.06, -span * 0.3, 0, -span * 0.2); sh.closePath(); return sh; }
function animQuad(st, dt) {
  const P = st.parts, t = st.t, an = st.anim; const S = st.root;
  if (an === 'dead') { S.rotation.z = Math.PI / 2; S.position.y = P.bodyY * 0.35 * st.spec.size; for (const l of P.legs) { l.pivot.rotation.x = 0.4; l.knee.rotation.x = 0.6; } P.jaw.rotation.x = 0.35; return; }
  S.rotation.z = 0; S.position.y = 0;
  const moving = an === 'walk' || an === 'run' || an === 'fly'; const speed = an === 'run' ? 12 : an === 'fly' ? 6 : 6.5; const amp = an === 'run' ? 0.7 : an === 'walk' ? 0.4 : 0;
  for (const l of P.legs) { const phase = (l.front ? 0 : Math.PI) + (l.left ? 0 : Math.PI) + (an === 'run' && !l.front ? Math.PI * 0.8 : 0); const sw = Math.sin(t * speed + phase) * amp; l.pivot.rotation.x = sw; l.knee.rotation.x = Math.max(0, -sw) * 1.2 + (moving ? 0.15 : 0.05); }
  P.hip.position.y = P.bodyY + (moving ? Math.abs(Math.sin(t * speed)) * 0.03 * st.spec.size : Math.sin(t * 1.5) * 0.008) + (an === 'fly' ? 0.6 + Math.sin(t * 6) * 0.08 : 0);
  P.hip.rotation.x = an === 'run' ? Math.sin(t * speed) * 0.06 : 0;
  P.neck.rotation.x = an === 'idle' ? Math.sin(t * 0.7) * 0.06 : an === 'attack' ? 0 : -0.1; P.neck.rotation.y = an === 'idle' ? Math.sin(t * 0.45) * 0.25 : 0;
  P.jaw.rotation.x = an === 'talk' ? 0.25 + Math.sin(t * 9) * 0.2 : an === 'attack' ? 0.5 : 0.02;
  if (an === 'attack') { const k = (t % 0.9) / 0.9; const lunge = k < 0.35 ? k / 0.35 : Math.max(0, 1 - (k - 0.35) / 0.5); P.neck.rotation.x = -0.35 * lunge; P.hip.position.z = lunge * 0.25; P.hip.rotation.x = -0.15 * lunge; for (const l of P.legs) if (l.front) l.pivot.rotation.x = -0.9 * lunge; } else P.hip.position.z = 0;
  for (let i = 0; i < P.tailSegs.length; i++) P.tailSegs[i].rotation.y = Math.sin(t * (moving ? 5 : 2) + i * 0.7) * (0.25 + i * 0.1) * (an === 'idle' ? 1 : 1.4);
  if (P.wings) for (const w of P.wings) w.group.rotation.z = w.side * (an === 'fly' ? Math.sin(t * 7) * 0.7 : an === 'attack' ? 0.9 : 0.55 + Math.sin(t * 1.2) * 0.05);
}

// ------------------------------------------------------------------ spider
function buildSpider(root, T, s) {
  const B = T.body, C = s.colors, F = s.features; const P = { legs: [] }; const y = B.legLen * 0.55; P.bodyY = y;
  const body = new THREE.Group(); body.position.y = y; root.add(body); P.hip = body;
  const abdomen = sphere(B.abdomenR, C.body); abdomen.position.z = -B.abdomenR * 0.9; abdomen.scale.set(1, 0.9, 1.2); body.add(abdomen);
  const mark = sphere(B.abdomenR * 0.35, C.accent, 10); mark.position.set(0, B.abdomenR * 0.8, -B.abdomenR * 0.9); mark.scale.set(1, 0.3, 1.6); body.add(mark);
  const thorax = sphere(B.thoraxR, shade(C.body, -0.1)); thorax.position.z = B.thoraxR * 0.5; body.add(thorax);
  const head = new THREE.Group(); head.position.set(0, B.thoraxR * 0.1, B.thoraxR * 1.4); body.add(head); P.head = head; P.neck = head;
  head.add(sphere(B.headR, C.body));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const big = i < 2; const e = sphere(B.headR * (big ? 0.28 : 0.14), C.eyes, 8); e.position.set(Math.sin(a) * B.headR * 0.55 * (big ? 0.6 : 1), B.headR * 0.35 + Math.cos(a) * B.headR * 0.25, B.headR * 0.85); head.add(e); }
  const jaw = new THREE.Group(); jaw.position.set(0, -B.headR * 0.4, B.headR * 0.6); head.add(jaw); P.jaw = jaw;
  if (F.fangs) for (const x of [-1, 1]) { const f = cone(B.headR * 0.18, B.headR * 0.7, C.accent, 6); f.rotation.x = Math.PI + 0.4; f.position.set(x * B.headR * 0.35, -B.headR * 0.1, B.headR * 0.1); jaw.add(f); }
  for (let i = 0; i < 8; i++) { const side = i < 4 ? -1 : 1; const k = i % 4; const z = B.thoraxR * (0.9 - k * 0.55); const pivot = new THREE.Group(); pivot.position.set(side * B.thoraxR * 0.8, 0, z); pivot.rotation.y = side * (0.9 - k * 0.55); body.add(pivot); const upper = capsule(B.legR, B.legLen * 0.5, C.body); upper.rotation.z = side * -Math.PI / 2; upper.position.x = side * B.legLen * 0.27; pivot.add(upper); const elbow = new THREE.Group(); elbow.position.x = side * B.legLen * 0.52; pivot.add(elbow); const lower = capsule(B.legR * 0.8, B.legLen * 0.55, shade(C.body, -0.15)); lower.rotation.z = side * -Math.PI / 2; lower.position.x = side * B.legLen * 0.28; elbow.add(lower); pivot.rotation.z = side * -0.55; elbow.rotation.z = side * 1.35; P.legs.push({ pivot, elbow, side, k, base: pivot.rotation.z, baseE: elbow.rotation.z }); }
  return P;
}
function animSpider(st) {
  const P = st.parts, t = st.t, an = st.anim; const S = st.root;
  if (an === 'dead') { S.rotation.x = Math.PI; S.position.y = P.bodyY * 1.6 * st.spec.size; for (const l of P.legs) { l.pivot.rotation.z = l.side * 0.9; l.elbow.rotation.z = l.side * 1.9; } return; }
  S.rotation.x = 0; S.position.y = 0; const moving = an === 'walk' || an === 'run'; const speed = an === 'run' ? 16 : 9;
  for (const l of P.legs) { const ph = (l.k % 2 === 0 ? 0 : Math.PI) + (l.side < 0 ? Math.PI : 0); const lift = moving ? Math.max(0, Math.sin(t * speed + ph)) * 0.35 : Math.sin(t * 1.3 + l.k) * 0.03; l.pivot.rotation.z = l.base - l.side * lift; l.elbow.rotation.z = l.baseE + l.side * lift * 0.8; l.pivot.rotation.y += moving ? Math.cos(t * speed + ph) * 0.004 : 0; }
  P.hip.position.y = P.bodyY + (an === 'attack' ? Math.abs(Math.sin(t * 6)) * 0.1 : moving ? Math.abs(Math.sin(t * speed * 0.5)) * 0.02 : Math.sin(t * 2) * 0.01);
  P.hip.rotation.x = an === 'attack' ? -0.3 : 0; P.jaw.rotation.x = an === 'attack' ? Math.sin(t * 12) * 0.3 : an === 'talk' ? Math.sin(t * 8) * 0.2 : 0;
  P.head.rotation.y = an === 'idle' ? Math.sin(t * 0.6) * 0.2 : 0;
}

// ------------------------------------------------------------------ bat (hovers)
function buildBat(root, T, s) {
  const B = T.body, C = s.colors, F = s.features; const P = { wings: [] }; const y = 1.1; P.bodyY = y;
  const body = new THREE.Group(); body.position.y = y; root.add(body); P.hip = body;
  const torso = capsule(B.r, B.r * 1.2, C.body); torso.rotation.x = 0.4; body.add(torso); const belly = capsule(B.r * 0.75, B.r, C.belly); belly.rotation.x = 0.4; belly.position.set(0, -B.r * 0.2, B.r * 0.35); body.add(belly);
  const head = new THREE.Group(); head.position.set(0, B.r * 1.1, B.r * 0.5); body.add(head); P.head = head; P.neck = head; head.add(sphere(B.headR, C.body));
  const jaw = new THREE.Group(); jaw.position.set(0, -B.headR * 0.4, B.headR * 0.5); head.add(jaw); P.jaw = jaw; const jm = sphere(B.headR * 0.5, shade(C.body, -0.15), 8); jm.scale.set(1, 0.5, 1.2); jaw.add(jm);
  if (F.fangs) for (const x of [-1, 1]) { const f = cone(B.headR * 0.12, B.headR * 0.4, '#f4f0e0', 5); f.rotation.x = Math.PI; f.position.set(x * B.headR * 0.3, -B.headR * 0.45, B.headR * 0.7); head.add(f); }
  for (const x of [-1, 1]) { const e = sphere(B.headR * 0.2, C.eyes, 8); e.position.set(x * B.headR * 0.4, B.headR * 0.15, B.headR * 0.8); head.add(e); const ear = cone(B.headR * 0.35, B.headR * 1.1, C.body, 6); ear.position.set(x * B.headR * 0.5, B.headR * 1.1, -B.headR * 0.1); ear.rotation.z = x * -0.25; head.add(ear); const inner = cone(B.headR * 0.2, B.headR * 0.8, C.accent, 6); inner.position.set(x * B.headR * 0.5, B.headR * 1.0, B.headR * 0.02); inner.rotation.z = x * -0.25; head.add(inner); }
  for (const x of [-1, 1]) { const w = new THREE.Group(); w.position.set(x * B.r * 0.6, B.r * 0.3, 0); body.add(w); const half = B.span / 2; const arm = cyl(0.015, 0.015, half, C.accent, 5); arm.rotation.z = Math.PI / 2; arm.position.x = x * half / 2; w.add(arm); for (let f = 1; f <= 3; f++) { const fin = cyl(0.008, 0.008, half * 0.75, C.accent, 4); fin.position.set(x * half * (0.55 + f * 0.13), -half * 0.28, 0); fin.rotation.z = x * (0.5 + f * 0.35); w.add(fin); } const mem = mesh(new THREE.ShapeGeometry(wingShape(half, x)), C.accent); mem.material.side = THREE.DoubleSide; w.add(mem); P.wings.push({ group: w, side: x }); }
  for (const x of [-1, 1]) { const foot = capsule(0.012, 0.06, C.accent); foot.position.set(x * B.r * 0.3, -B.r * 0.9, -B.r * 0.2); body.add(foot); }
  return P;
}
function animBat(st) {
  const P = st.parts, t = st.t, an = st.anim; const S = st.root;
  if (an === 'dead') { S.rotation.z = Math.PI; S.position.y = 0.25 * st.spec.size; for (const w of P.wings) w.group.rotation.z = w.side * 1.2; return; }
  S.rotation.z = 0; S.position.y = 0; const flap = an === 'attack' || an === 'run' ? 22 : 12;
  for (const w of P.wings) w.group.rotation.z = w.side * Math.sin(t * flap) * 0.75;
  P.hip.position.y = P.bodyY + Math.sin(t * flap * 0.5) * 0.05 + (an === 'attack' ? -0.35 + Math.abs(Math.sin(t * 4)) * 0.3 : 0) + (an === 'walk' || an === 'run' ? Math.sin(t * 2) * 0.15 : 0);
  P.hip.rotation.x = an === 'attack' ? 0.6 : an === 'walk' || an === 'run' ? 0.3 : 0.1; P.head.rotation.y = an === 'idle' ? Math.sin(t * 1.1) * 0.35 : 0;
  P.jaw.rotation.x = an === 'talk' || an === 'attack' ? 0.3 + Math.sin(t * 14) * 0.25 : 0.05;
}

// ------------------------------------------------------------------ snake (chain of segments, head at +z)
function buildSnake(root, T, s) {
  const B = T.body, C = s.colors, F = s.features; const P = { segs: [] }; const segLen = B.len / B.segs; P.bodyY = B.r;
  let parent = root; const head = new THREE.Group(); head.position.set(0, B.r * 1.6, 0); root.add(head); P.head = head; P.neck = head; P.hip = head;
  const skull = sphere(B.headR, C.body); skull.scale.set(1.1, 0.75, 1.4); head.add(skull);
  const jaw = new THREE.Group(); jaw.position.set(0, -B.headR * 0.3, B.headR * 0.3); head.add(jaw); P.jaw = jaw; const jm = sphere(B.headR * 0.8, shade(C.body, -0.15), 10); jm.scale.set(1, 0.35, 1.3); jm.position.z = B.headR * 0.4; jaw.add(jm);
  if (F.fangs) for (const x of [-1, 1]) { const f = cone(B.headR * 0.08, B.headR * 0.45, '#f4f0e0', 5); f.rotation.x = Math.PI; f.position.set(x * B.headR * 0.4, -B.headR * 0.3, B.headR * 1.1); head.add(f); }
  for (const x of [-1, 1]) { const e = sphere(B.headR * 0.18, C.eyes, 8); e.position.set(x * B.headR * 0.55, B.headR * 0.25, B.headR * 0.7); head.add(e); const slit = box(B.headR * 0.04, B.headR * 0.2, B.headR * 0.05, '#111'); slit.position.set(x * B.headR * 0.58, B.headR * 0.25, B.headR * 0.86); head.add(slit); }
  const tongue = box(0.012, 0.005, B.headR * 1.0, '#e04060'); tongue.position.set(0, -B.headR * 0.15, B.headR * 1.7); head.add(tongue); P.tongue = tongue;
  parent = head;
  for (let i = 0; i < B.segs; i++) { const seg = new THREE.Group(); seg.position.z = i === 0 ? -B.headR * 0.9 : -segLen; parent.add(seg); const r = B.r * (i < B.segs - 3 ? 1 : (B.segs - i) / 3.5); const m = capsule(r, segLen, i % 2 ? C.body : shade(C.body, -0.12)); m.rotation.x = Math.PI / 2; m.position.z = -segLen / 2; seg.add(m); const bl = capsule(r * 0.7, segLen, C.belly); bl.rotation.x = Math.PI / 2; bl.position.set(0, -r * 0.45, -segLen / 2); seg.add(bl); P.segs.push(seg); parent = seg; }
  return P;
}
function animSnake(st) {
  const P = st.parts, t = st.t, an = st.anim; const S = st.root;
  if (an === 'dead') { S.rotation.z = Math.PI; S.position.y = P.bodyY * 3.2 * st.spec.size; for (const s of P.segs) s.rotation.y = 0; P.jaw.rotation.x = 0.4; return; }
  S.rotation.z = 0; S.position.y = 0; const moving = an === 'walk' || an === 'run'; const speed = an === 'run' ? 9 : moving ? 5 : 1.2; const amp = moving ? 0.28 : 0.08;
  for (let i = 0; i < P.segs.length; i++) P.segs[i].rotation.y = Math.sin(t * speed - i * 0.6) * amp;
  P.head.rotation.y = Math.sin(t * speed) * amp * 0.5; P.head.position.y = P.bodyY * 1.6 + (an === 'attack' ? 0.35 : an === 'idle' ? Math.sin(t * 1.5) * 0.03 + 0.15 : 0);
  P.head.rotation.x = an === 'attack' ? ((t % 0.8) < 0.3 ? -0.6 : 0.5) : an === 'idle' ? -0.35 : 0;
  P.jaw.rotation.x = an === 'attack' ? 0.6 : an === 'talk' ? 0.2 + Math.sin(t * 9) * 0.15 : 0.02; P.tongue.visible = Math.sin(t * 3) > 0.6 || an === 'attack';
}
