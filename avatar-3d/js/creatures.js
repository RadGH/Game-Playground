// Procedural Mii-style creatures (non-humanoid) from Three.js primitives: quadrupeds (wolves, bears, hounds, cats,
// frogs...), a spider, fliers (bat, owl, moth), serpents (snake, worm), winged dragons, bipeds (golem, titan, imp)
// and floaters (elemental, wisp, shard, wraith, horror). Same interface as createMiiCharacter: { group, update(dt,t), setAnim(name), setSpec(spec), dispose() }.
//
// Creature JSON (a character document can carry it as `creature`; when present, use it instead of `avatar` for 3D):
//   { type: 'wolf' | 'dire_wolf' | 'boar' | 'bear' | 'rat' | 'horse' | 'deer' | 'bat' | 'spider' | 'snake' | 'drake' | 'dragon'
//           | 'hound' | 'cat' | 'frog' | 'owl' | 'moth' | 'worm' | 'golem' | 'titan' | 'imp' | 'elemental' | 'wisp' | 'shard' | 'wraith' | 'horror',
//     size: 1 (scale multiplier), colors: { body, belly, accent, eyes }, seed,
//     features: { horns, wings, tail, mane, tusks, spikes, claws, fangs, core, glow, bulgeEyes, beak, antennae, maw, plates } (overrides) }
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
function glowMat(color, intensity = 0.9) { return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.55, metalness: 0 }); }
function glowMesh(geo, color, intensity) { const m = new THREE.Mesh(geo, glowMat(color, intensity)); m.castShadow = false; return m; }
const glowSphere = (r, c, i = 0.9, s = 14) => glowMesh(new THREE.SphereGeometry(r, s, s), c, i);
const glowOcta = (r, c, i = 0.7) => glowMesh(new THREE.OctahedronGeometry(r, 0), c, i);
const rng = seed => { let a = (seed ?? 1) >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

export { CREATURE_TYPES, CREATURE_ANIMS, normalizeCreature } from './creature-types.js';
import { CREATURE_TYPES, normalizeCreature } from './creature-types.js';

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
    state.parts = ({ quad: buildQuad, spider: buildSpider, bat: buildBat, snake: buildSnake, biped: buildBiped, float: buildFloat })[T.plan](root, T, s);
  }
  build(spec);
  return {
    group, get anim() { return state.anim; }, setAnim(n) { state.anim = n; state.t = 0; }, setSpec(sp) { build(sp); }, get spec() { return state.spec; },
    metrics() { const b = new THREE.Box3().setFromObject(group); return { height: b.max.y - b.min.y, length: b.max.z - b.min.z, width: b.max.x - b.min.x }; },
    update(dt, t) { state.t += dt; const fn = ({ quad: animQuad, spider: animSpider, bat: animBat, snake: animSnake, biped: animBiped, float: animFloat })[state.plan]; if (fn) fn(state, dt); },
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
  const eyeR = B.headR * (F.bulgeEyes ? 0.36 : 0.16), eyeY = B.headR * (F.bulgeEyes ? 0.7 : 0.2), eyeX = B.headR * (F.bulgeEyes ? 0.55 : 0.45), eyeZ = B.headR * (F.bulgeEyes ? 0.35 : 0.75);
  for (const x of [-1, 1]) { const eye = sphere(eyeR, C.eyes, 10); eye.position.set(x * eyeX, eyeY, eyeZ); head.add(eye); const pupil = sphere(eyeR * 0.42, '#111', 8); pupil.position.set(x * eyeX, eyeY + eyeR * 0.25, eyeZ + eyeR * 0.8); head.add(pupil); }
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
// The spider stands ON its legs: each leg goes UP from the body to a knee above the abdomen and then
// straight back DOWN to the floor, which is what makes a spider read as a spider. It used to be built
// the other way round (knee down, foot up) with legs too short to reach the ground, so the body sat in
// the dirt and the whole thing looked upside down (E17). LEG_* are the proportions of one leg.
const SPIDER_LEG = { up: 0.52, upper: 0.6, lower: 1.0, body: 0.76, knee: -1.72 };  // radians / multiples of legLen
function buildSpider(root, T, s) {
  const B = T.body, C = s.colors, F = s.features; const P = { legs: [] }; const L = SPIDER_LEG; const y = B.legLen * L.body; P.bodyY = y;
  const body = new THREE.Group(); body.position.y = y; root.add(body); P.hip = body;
  const abdomen = sphere(B.abdomenR, C.body); abdomen.position.z = -B.abdomenR * 0.9; abdomen.scale.set(1, 0.9, 1.2); body.add(abdomen);
  const mark = sphere(B.abdomenR * 0.35, C.accent, 10); mark.position.set(0, B.abdomenR * 0.8, -B.abdomenR * 0.9); mark.scale.set(1, 0.3, 1.6); body.add(mark);
  const thorax = sphere(B.thoraxR, shade(C.body, -0.1)); thorax.position.z = B.thoraxR * 0.5; body.add(thorax);
  const head = new THREE.Group(); head.position.set(0, B.thoraxR * 0.1, B.thoraxR * 1.4); body.add(head); P.head = head; P.neck = head;
  head.add(sphere(B.headR, C.body));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const big = i < 2; const e = sphere(B.headR * (big ? 0.28 : 0.14), C.eyes, 8); e.position.set(Math.sin(a) * B.headR * 0.55 * (big ? 0.6 : 1), B.headR * 0.35 + Math.cos(a) * B.headR * 0.25, B.headR * 0.85); head.add(e); }
  const jaw = new THREE.Group(); jaw.position.set(0, -B.headR * 0.4, B.headR * 0.6); head.add(jaw); P.jaw = jaw;
  if (F.fangs) for (const x of [-1, 1]) { const f = cone(B.headR * 0.18, B.headR * 0.7, C.accent, 6); f.rotation.x = Math.PI + 0.4; f.position.set(x * B.headR * 0.35, -B.headR * 0.1, B.headR * 0.1); jaw.add(f); }
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1; const k = i % 4; const z = B.thoraxR * (0.9 - k * 0.55);
    const pivot = new THREE.Group(); pivot.position.set(side * B.thoraxR * 0.8, 0, z); pivot.rotation.y = side * (0.9 - k * 0.55); body.add(pivot);
    // upper segment: lies along the arm's local +x (side), so a positive side*angle lifts it
    const upper = capsule(B.legR, B.legLen * L.upper, C.body); upper.rotation.z = side * -Math.PI / 2; upper.position.x = side * B.legLen * L.upper * 0.5; pivot.add(upper);
    const elbow = new THREE.Group(); elbow.position.x = side * B.legLen * L.upper; pivot.add(elbow);
    const lower = capsule(B.legR * 0.75, B.legLen * L.lower, shade(C.body, -0.15)); lower.rotation.z = side * -Math.PI / 2; lower.position.x = side * B.legLen * L.lower * 0.5; elbow.add(lower);
    const foot = cone(B.legR * 1.3, B.legLen * 0.12, shade(C.body, -0.3), 6); foot.rotation.z = side * Math.PI / 2; foot.position.x = side * B.legLen * (L.lower + 0.06); elbow.add(foot);
    pivot.rotation.z = side * L.up;          // knee up, above the abdomen
    elbow.rotation.z = side * L.knee;        // then straight back down to the floor
    P.legs.push({ pivot, elbow, side, k, base: pivot.rotation.z, baseE: elbow.rotation.z });
  }
  return P;
}
function animSpider(st) {
  const P = st.parts, t = st.t, an = st.anim; const S = st.root;
  // dead: rolled onto its back with the legs curled in over it
  if (an === 'dead') { S.rotation.x = Math.PI; S.position.y = P.bodyY * 1.7 * st.spec.size; for (const l of P.legs) { l.pivot.rotation.z = l.side * 0.35; l.elbow.rotation.z = l.side * 2.3; } return; }
  S.rotation.x = 0; S.position.y = 0; const moving = an === 'walk' || an === 'run'; const speed = an === 'run' ? 16 : 9;
  // walking lifts the foot by straightening the knee a little, never by dropping the body
  for (const l of P.legs) { const ph = (l.k % 2 === 0 ? 0 : Math.PI) + (l.side < 0 ? Math.PI : 0); const lift = moving ? Math.max(0, Math.sin(t * speed + ph)) * 0.3 : Math.sin(t * 1.3 + l.k) * 0.03; l.pivot.rotation.z = l.base + l.side * lift * 0.35; l.elbow.rotation.z = l.baseE + l.side * lift; l.pivot.rotation.y += moving ? Math.cos(t * speed + ph) * 0.004 : 0; }
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
  if (F.beak) { const bk = cone(B.headR * 0.3, B.headR * 0.75, C.accent, 8); bk.rotation.x = Math.PI / 2; bk.position.set(0, -B.headR * 0.1, B.headR * 0.95); head.add(bk); }
  if (F.antennae) for (const x of [-1, 1]) { const a = cyl(0.004, 0.008, B.headR * 1.6, C.accent, 5); a.position.set(x * B.headR * 0.35, B.headR * 1.1, B.headR * 0.3); a.rotation.set(-0.5, 0, x * -0.5); head.add(a); const tip = sphere(B.headR * 0.12, C.belly, 8); tip.position.set(x * B.headR * 0.95, B.headR * 1.75, B.headR * 0.75); head.add(tip); }
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
  const B = T.body, C = s.colors, F = s.features; const P = { segs: [] }; const segLen = B.len / B.segs; P.bodyY = B.r; P.rearPose = !!B.rearPose;
  P.rear = B.rear ?? (B.rearPose ? (B.r + 2 * segLen * Math.sin(0.8)) / B.r : 1.6);
  let parent = root; const head = new THREE.Group(); head.position.set(0, B.r * P.rear, 0); root.add(head); P.head = head; P.neck = head; P.hip = head;
  const skull = sphere(B.headR, C.body); skull.scale.set(...(B.thick ? [1.15, 1.05, 1.15] : [1.1, 0.75, 1.4])); head.add(skull);
  if (F.maw) { const maw = sphere(B.headR * 0.62, C.accent, 12); maw.position.z = B.headR * 0.85; maw.scale.set(1, 1, 0.5); head.add(maw); for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const tooth = cone(B.headR * 0.09, B.headR * 0.42, '#efe6d2', 5); tooth.position.set(Math.cos(a) * B.headR * 0.55, Math.sin(a) * B.headR * 0.55, B.headR * 0.95); tooth.rotation.x = Math.PI / 2; head.add(tooth); } }
  const jaw = new THREE.Group(); jaw.position.set(0, -B.headR * 0.3, B.headR * 0.3); head.add(jaw); P.jaw = jaw; const jm = sphere(B.headR * 0.8, shade(C.body, -0.15), 10); jm.scale.set(1, 0.35, 1.3); jm.position.z = B.headR * 0.4; jaw.add(jm);
  if (F.fangs) for (const x of [-1, 1]) { const f = cone(B.headR * 0.08, B.headR * 0.45, '#f4f0e0', 5); f.rotation.x = Math.PI; f.position.set(x * B.headR * 0.4, -B.headR * 0.3, B.headR * 1.1); head.add(f); }
  for (const x of [-1, 1]) { const e = sphere(B.headR * 0.18, C.eyes, 8); e.position.set(x * B.headR * 0.55, B.headR * 0.25, B.headR * 0.7); head.add(e); const slit = box(B.headR * 0.04, B.headR * 0.2, B.headR * 0.05, '#111'); slit.position.set(x * B.headR * 0.58, B.headR * 0.25, B.headR * 0.86); head.add(slit); }
  const tongue = box(0.012, 0.005, B.headR * 1.0, '#e04060'); tongue.position.set(0, -B.headR * 0.15, B.headR * 1.7); tongue.visible = !F.maw; head.add(tongue); P.tongue = tongue;
  parent = head;
  for (let i = 0; i < B.segs; i++) { const seg = new THREE.Group(); seg.position.z = i === 0 ? -B.headR * 0.9 : -segLen; parent.add(seg); const r = B.r * (i < B.segs - 3 ? 1 : (B.segs - i) / 3.5); const m = capsule(r, segLen, i % 2 ? C.body : shade(C.body, -0.12)); m.rotation.x = Math.PI / 2; m.position.z = -segLen / 2; seg.add(m); const bl = capsule(r * 0.7, segLen, C.belly); bl.rotation.x = Math.PI / 2; bl.position.set(0, -r * 0.45, -segLen / 2); seg.add(bl); if (F.plates && i % 2 === 0) { const ring = mesh(new THREE.TorusGeometry(r * 1.05, r * 0.16, 6, 14), C.accent); ring.position.z = -segLen / 2; seg.add(ring); } P.segs.push(seg); parent = seg; }
  if (B.rearPose) { if (P.segs[0]) P.segs[0].rotation.x = -0.8; if (P.segs[2]) P.segs[2].rotation.x = 0.8; }
  return P;
}
function animSnake(st) {
  const P = st.parts, t = st.t, an = st.anim; const S = st.root;
  if (an === 'dead') { S.rotation.z = Math.PI; S.position.y = P.bodyY * 3.2 * st.spec.size; for (const s of P.segs) s.rotation.y = 0; P.jaw.rotation.x = 0.4; return; }
  S.rotation.z = 0; S.position.y = 0; const moving = an === 'walk' || an === 'run'; const speed = an === 'run' ? 9 : moving ? 5 : 1.2; const amp = moving ? 0.28 : 0.08;
  for (let i = 0; i < P.segs.length; i++) P.segs[i].rotation.y = Math.sin(t * speed - i * 0.6) * amp;
  P.head.rotation.y = Math.sin(t * speed) * amp * 0.5; P.head.position.y = P.bodyY * P.rear + (an === 'attack' ? 0.35 : an === 'idle' ? Math.sin(t * 1.5) * 0.03 + 0.15 : 0);
  P.head.rotation.x = an === 'attack' ? ((t % 0.8) < 0.3 ? -0.6 : 0.5) : an === 'idle' ? (P.rearPose ? -0.12 + Math.sin(t * 1.2) * 0.06 : -0.35) : 0;
  P.jaw.rotation.x = an === 'attack' ? 0.6 : an === 'talk' ? 0.2 + Math.sin(t * 9) * 0.15 : 0.02; if (!st.spec.features.maw) P.tongue.visible = Math.sin(t * 3) > 0.6 || an === 'attack';
}

// ------------------------------------------------------------------ biped (golems, titans, imps; faces +z)
// Two legs, two arms, a head on a short neck. `body.blocky` swaps capsules for boxes (stone/metal constructs).
// Features: core (glowing chest heart), spikes (shoulder/back), horns, claws, fangs, tail, wings.
function buildBiped(root, T, s) {
  const B = T.body, C = s.colors, F = s.features; const P = { legs: [], arms: [] }; const blocky = !!B.blocky;
  P.bodyY = B.legLen; const hip = new THREE.Group(); hip.position.y = B.legLen; root.add(hip); P.hip = hip;
  const torso = blocky ? box(B.torsoR * 2, B.torsoH, B.torsoR * 1.35, C.body) : capsule(B.torsoR, Math.max(0.02, B.torsoH - B.torsoR * 2), C.body);
  torso.position.y = B.torsoH * 0.5; hip.add(torso);
  const belly = blocky ? box(B.torsoR * 1.4, B.torsoH * 0.42, B.torsoR * 0.3, C.belly) : capsule(B.torsoR * 0.68, B.torsoH * 0.3, C.belly);
  belly.position.set(0, B.torsoH * 0.4, B.torsoR * (blocky ? 0.7 : 0.45)); hip.add(belly);
  const pelvis = blocky ? box(B.torsoR * 1.7, B.torsoR * 0.7, B.torsoR * 1.2, shade(C.body, -0.12)) : sphere(B.torsoR * 0.8, shade(C.body, -0.12), 12); hip.add(pelvis);
  if (F.core) { const core = glowSphere(B.torsoR * 0.34, C.eyes, 1.1, 12); core.position.set(0, B.torsoH * 0.62, B.torsoR * (blocky ? 0.72 : 0.5)); hip.add(core); P.core = core; }
  if (F.spikes) for (let i = 0; i < 3; i++) { const sp = cone(B.torsoR * 0.16, B.torsoR * 0.7, C.accent, 6); sp.position.set(0, B.torsoH * (0.35 + i * 0.25), -B.torsoR * (blocky ? 0.7 : 0.55)); sp.rotation.x = 0.5; hip.add(sp); }
  // legs
  for (const x of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(x * B.torsoR * 0.52, 0, 0); hip.add(pivot);
    const upper = blocky ? box(B.legR * 2, B.legLen * 0.52, B.legR * 2, C.body) : capsule(B.legR, B.legLen * 0.4, C.body); upper.position.y = -B.legLen * 0.26; pivot.add(upper);
    const knee = new THREE.Group(); knee.position.y = -B.legLen * 0.5; pivot.add(knee);
    const lower = blocky ? box(B.legR * 1.8, B.legLen * 0.46, B.legR * 1.8, shade(C.body, -0.1)) : capsule(B.legR * 0.85, B.legLen * 0.36, shade(C.body, -0.1)); lower.position.y = -B.legLen * 0.24; knee.add(lower);
    const foot = box(B.legR * 2.2, B.legR * 0.9, B.legR * 3.2, C.accent); foot.position.set(0, -B.legLen * 0.5 + B.legR * 0.45, B.legR * 0.7); knee.add(foot);
    P.legs.push({ pivot, knee, side: x });
  }
  // arms
  for (const x of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(x * (B.torsoR + B.armR * 0.5), B.torsoH * 0.84, 0); hip.add(shoulder);
    const pad = blocky ? box(B.armR * 2.6, B.armR * 2.2, B.armR * 2.6, shade(C.body, 0.1)) : sphere(B.armR * 1.45, shade(C.body, 0.1), 12); shoulder.add(pad);
    if (F.spikes) { const sp = cone(B.armR * 0.7, B.armR * 2, C.accent, 6); sp.position.y = B.armR * 1.6; sp.rotation.z = x * 0.35; shoulder.add(sp); }
    const upper = blocky ? box(B.armR * 1.8, B.armLen * 0.5, B.armR * 1.8, C.body) : capsule(B.armR, B.armLen * 0.38, C.body); upper.position.y = -B.armLen * 0.25; shoulder.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -B.armLen * 0.5; shoulder.add(elbow);
    const lower = blocky ? box(B.armR * 1.6, B.armLen * 0.46, B.armR * 1.6, shade(C.body, -0.08)) : capsule(B.armR * 0.85, B.armLen * 0.36, shade(C.body, -0.08)); lower.position.y = -B.armLen * 0.24; elbow.add(lower);
    const hand = blocky ? box(B.armR * 2.3, B.armR * 2.3, B.armR * 2.3, shade(C.body, -0.16)) : sphere(B.armR * 1.3, shade(C.body, -0.16), 12); hand.position.y = -B.armLen * 0.48; elbow.add(hand);
    if (F.claws) for (let i = -1; i <= 1; i++) { const cl = cone(B.armR * 0.3, B.armR * 1.5, C.accent, 5); cl.rotation.x = Math.PI * 0.5 + 0.6; cl.position.set(i * B.armR * 0.8, -B.armLen * 0.52, B.armR * 1.1); elbow.add(cl); }
    P.arms.push({ shoulder, elbow, side: x });
  }
  // neck + head
  const neck = new THREE.Group(); neck.position.y = B.torsoH + (B.neck || 0); hip.add(neck); P.neck = neck;
  const head = new THREE.Group(); head.position.y = B.headR * 0.85; neck.add(head); P.head = head;
  const skull = blocky ? box(B.headR * 1.7, B.headR * 1.8, B.headR * 1.6, C.body) : sphere(B.headR, C.body); head.add(skull);
  const brow = blocky ? box(B.headR * 1.8, B.headR * 0.35, B.headR * 0.4, C.accent) : capsule(B.headR * 0.16, B.headR * 1.3, C.accent); if (!blocky) brow.rotation.z = Math.PI / 2; brow.position.set(0, B.headR * 0.42, B.headR * 0.72); head.add(brow);
  for (const x of [-1, 1]) { const eye = glowSphere(B.headR * 0.2, C.eyes, 1.1, 10); eye.position.set(x * B.headR * 0.42, B.headR * 0.12, B.headR * 0.76); head.add(eye); }
  const jaw = new THREE.Group(); jaw.position.set(0, -B.headR * 0.5, B.headR * 0.12); head.add(jaw); P.jaw = jaw;
  const jawM = blocky ? box(B.headR * 1.4, B.headR * 0.55, B.headR * 1.3, shade(C.body, -0.14)) : capsule(B.headR * 0.5, B.headR * 0.35, shade(C.body, -0.14)); jawM.position.set(0, -B.headR * 0.1, B.headR * 0.2); jaw.add(jawM);
  if (F.fangs) for (const x of [-1, 1]) { const f = cone(B.headR * 0.12, B.headR * 0.42, '#f4f0e0', 5); f.rotation.x = Math.PI; f.position.set(x * B.headR * 0.35, -B.headR * 0.42, B.headR * 0.55); head.add(f); }
  if (F.horns) for (const x of [-1, 1]) { const h = cone(B.headR * 0.22, B.headR * 1.3, C.accent, 7); h.position.set(x * B.headR * 0.6, B.headR * 0.85, -B.headR * 0.1); h.rotation.set(-0.35, 0, x * -0.5); head.add(h); }
  // tail (imps)
  P.tailSegs = [];
  if (F.tail) { let parent = new THREE.Group(); parent.position.set(0, B.torsoR * 0.2, -B.torsoR * 0.9); hip.add(parent); P.tail = parent;
    for (let i = 0; i < 4; i++) { const seg = new THREE.Group(); const l = B.torsoH * 0.36, r = B.armR * (0.9 - i * 0.15); const m = capsule(r, l, C.body); m.rotation.x = Math.PI / 2; m.position.z = -l / 2; seg.add(m); seg.rotation.x = i === 0 ? -0.5 : 0.25; seg.position.z = i === 0 ? 0 : -l; parent.add(seg); parent = seg; P.tailSegs.push(seg); }
    const spade = cone(B.armR * 1.1, B.armR * 2.6, C.accent, 4); spade.rotation.x = -Math.PI / 2; spade.position.z = -B.torsoH * 0.5; parent.add(spade); }
  // wings
  if (F.wings) { P.wings = []; for (const x of [-1, 1]) { const w = new THREE.Group(); w.position.set(x * B.torsoR * 0.7, B.torsoH * 0.78, -B.torsoR * 0.5); hip.add(w); const span = B.torsoH * 1.5; const bone = cyl(B.armR * 0.35, B.armR * 0.35, span, C.accent, 6); bone.rotation.z = x * -Math.PI / 2; bone.position.x = x * span / 2; w.add(bone); const mem = mesh(new THREE.ShapeGeometry(wingShape(span, x)), C.belly); mem.material.side = THREE.DoubleSide; mem.material.transparent = true; mem.material.opacity = 0.92; w.add(mem); P.wings.push({ group: w, side: x }); } }
  P.type = s.type; return P;
}
function animBiped(st) {
  const P = st.parts, t = st.t, an = st.anim, S = st.root;
  if (an === 'dead') { S.rotation.x = -Math.PI / 2; S.position.y = P.bodyY * 0.28 * st.spec.size; for (const l of P.legs) { l.pivot.rotation.x = 0.25; l.knee.rotation.x = 0.3; } for (const a of P.arms) { a.shoulder.rotation.z = a.side * 1.1; a.elbow.rotation.x = 0; } P.jaw.rotation.x = 0.3; return; }
  S.rotation.x = 0; S.position.y = 0;
  const moving = an === 'walk' || an === 'run'; const speed = an === 'run' ? 11 : 6; const amp = an === 'run' ? 0.75 : moving ? 0.45 : 0;
  for (const l of P.legs) { const ph = l.side < 0 ? 0 : Math.PI; const sw = Math.sin(t * speed + ph) * amp; l.pivot.rotation.x = sw; l.knee.rotation.x = Math.max(0, -sw) * 1.1 + (moving ? 0.12 : 0.05); }
  const atk = an === 'attack' ? (k => k < 0.3 ? k / 0.3 : Math.max(0, 1 - (k - 0.3) / 0.55))((t % 1.1) / 1.1) : 0;
  for (const a of P.arms) { const ph = a.side < 0 ? Math.PI : 0; a.shoulder.rotation.x = moving ? Math.sin(t * speed + ph) * amp * 0.7 : Math.sin(t * 1.2 + ph) * 0.05; a.shoulder.rotation.z = a.side * (0.12 + (moving ? 0.05 : 0.03) * Math.sin(t * 1.4)); a.elbow.rotation.x = -0.2 - (moving ? 0.2 : 0.05); }
  if (atk > 0) { const a = P.arms[1]; a.shoulder.rotation.x = -2.4 * atk + 0.9 * atk * atk; a.shoulder.rotation.z = 0; a.elbow.rotation.x = -1.2 * atk; }
  P.hip.position.y = P.bodyY + (moving ? Math.abs(Math.sin(t * speed)) * 0.04 * st.spec.size : Math.sin(t * 1.4) * 0.012) + (an === 'fly' ? 0.55 + Math.sin(t * 2.2) * 0.06 : 0);
  P.hip.position.z = atk * 0.18; P.hip.rotation.x = an === 'run' ? -0.14 : atk * -0.2;
  P.neck.rotation.y = an === 'idle' ? Math.sin(t * 0.5) * 0.3 : 0; P.neck.rotation.x = an === 'run' ? 0.12 : 0;
  P.jaw.rotation.x = an === 'talk' ? 0.22 + Math.sin(t * 9) * 0.18 : atk > 0 ? 0.35 * atk : 0.03;
  for (let i = 0; i < P.tailSegs.length; i++) P.tailSegs[i].rotation.y = Math.sin(t * (moving ? 5 : 2) + i * 0.7) * (0.2 + i * 0.08);
  if (P.core) P.core.material.emissiveIntensity = 0.8 + Math.sin(t * 3) * 0.35 + atk * 0.8;
  if (P.wings) for (const w of P.wings) w.group.rotation.z = w.side * (an === 'fly' ? Math.sin(t * 8) * 0.7 : atk > 0 ? 0.9 : 0.45 + Math.sin(t * 1.4) * 0.08);
}

// ------------------------------------------------------------------ float (elementals, wisps, shards, wraiths, horrors)
// No legs: a hovering core with orbiting shards, hanging tatters, tentacles or sleeve arms. `body.shape`:
//   sphere  — glowing ball with flame licks (elementals, wisps)
//   crystal — octahedron cluster (shards)
//   hood    — hooded robe with an empty face and trailing rags (wraiths)
//   mass    — lumpy body covered in eyes with tentacles (horrors)
function buildFloat(root, T, s) {
  const B = T.body, C = s.colors, F = s.features; const P = { tentacles: [], tatters: [], shards: [], arms: [] };
  const y = B.y ?? 1.1; P.bodyY = y; P.coreR = B.coreR;
  const body = new THREE.Group(); body.position.y = y; root.add(body); P.hip = body;
  const core = new THREE.Group(); body.add(core); P.head = core; P.neck = core; P.jaw = new THREE.Group(); core.add(P.jaw);
  const shape = B.shape || 'sphere';
  if (shape === 'sphere') {
    const shell = glowSphere(B.coreR, C.body, 0.5, 16); shell.material.transparent = true; shell.material.opacity = 0.85; core.add(shell);
    const inner = glowSphere(B.coreR * 0.62, C.eyes, 1.3, 14); core.add(inner); P.pulse = inner;
    for (let i = 0; i < (B.licks ?? 5); i++) { const a = (i / (B.licks ?? 5)) * Math.PI * 2; const f = glowMesh(new THREE.ConeGeometry(B.coreR * 0.22, B.coreR * 1.1, 6), C.belly, 0.7); f.position.set(Math.cos(a) * B.coreR * 0.68, B.coreR * 0.95, Math.sin(a) * B.coreR * 0.68); f.rotation.z = Math.cos(a) * -0.25; core.add(f); P.shards.push({ mesh: f, a }); }
  } else if (shape === 'crystal') {
    const main = glowOcta(B.coreR, C.body, 0.5); main.scale.set(0.8, 1.5, 0.8); core.add(main);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; const c = glowOcta(B.coreR * 0.5, C.belly, 0.6); c.position.set(Math.cos(a) * B.coreR * 0.6, (i % 2 ? 0.25 : -0.3) * B.coreR, Math.sin(a) * B.coreR * 0.6); c.rotation.set(0.5, a, 0.3); c.scale.set(0.7, 1.3, 0.7); core.add(c); }
    const heart = glowSphere(B.coreR * 0.3, C.eyes, 1.4, 10); core.add(heart); P.pulse = heart;
  } else if (shape === 'hood') {
    const robe = cyl(B.coreR * 0.7, B.coreR * 1.7, B.coreR * 3.2, C.body, 14); robe.position.y = -B.coreR * 1.35; body.add(robe);
    const hem = mesh(new THREE.TorusGeometry(B.coreR * 1.65, B.coreR * 0.16, 6, 16), shade(C.body, -0.2)); hem.rotation.x = Math.PI / 2; hem.position.y = -B.coreR * 2.9; body.add(hem);
    const shoulders = capsule(B.coreR * 0.5, B.coreR * 1.5, C.body); shoulders.rotation.z = Math.PI / 2; shoulders.position.y = -B.coreR * 0.15; body.add(shoulders);
    const hood = cone(B.coreR * 0.95, B.coreR * 1.7, shade(C.body, -0.15), 12); hood.position.y = B.coreR * 0.55; core.add(hood);
    const voidFace = sphere(B.coreR * 0.62, C.accent, 12); voidFace.position.set(0, B.coreR * 0.35, B.coreR * 0.3); core.add(voidFace);
    for (const x of [-1, 1]) { const e = glowSphere(B.coreR * 0.14, C.eyes, 1.4, 10); e.position.set(x * B.coreR * 0.26, B.coreR * 0.4, B.coreR * 0.72); core.add(e); P.shards.push({ mesh: e, a: 0 }); }
  } else { // mass
    const blob = glowSphere(B.coreR, C.body, 0.25, 16); blob.material.emissiveIntensity = 0.15; core.add(blob);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const lump = sphere(B.coreR * 0.5, shade(C.body, i % 2 ? 0.12 : -0.12), 12); lump.position.set(Math.cos(a) * B.coreR * 0.7, Math.sin(a * 1.7) * B.coreR * 0.4, Math.sin(a) * B.coreR * 0.7); core.add(lump); }
    for (let i = 0; i < (B.eyes ?? 8); i++) { const a = (i / (B.eyes ?? 8)) * Math.PI * 2 * 1.6, ry = ((i % 3) - 1) * 0.5; const e = glowSphere(B.coreR * 0.17, C.eyes, 1.2, 10); e.position.set(Math.cos(a) * B.coreR * 0.9, ry * B.coreR * 0.8, Math.sin(a) * B.coreR * 0.9 + B.coreR * 0.15); core.add(e); const pupil = sphere(B.coreR * 0.07, '#150a10', 8); pupil.position.copy(e.position).multiplyScalar(1.1); core.add(pupil); P.shards.push({ mesh: e, a }); }
    const maw = sphere(B.coreR * 0.45, C.accent, 12); maw.position.set(0, -B.coreR * 0.35, B.coreR * 0.8); maw.scale.set(1, 0.7, 0.5); P.jaw.add(maw);
    if (F.fangs) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const tooth = cone(B.coreR * 0.06, B.coreR * 0.3, '#efe6d2', 5); tooth.position.set(Math.cos(a) * B.coreR * 0.3, -B.coreR * 0.35 + Math.sin(a) * B.coreR * 0.22, B.coreR * 0.92); tooth.rotation.x = Math.PI / 2; P.jaw.add(tooth); }
  }
  // orbiting shards
  if (B.shards) { const orbit = new THREE.Group(); body.add(orbit); P.orbit = orbit;
    for (let i = 0; i < B.shards; i++) { const a = (i / B.shards) * Math.PI * 2; const sh = glowOcta(B.shardR ?? B.coreR * 0.35, C.belly, 0.8); sh.position.set(Math.cos(a) * (B.orbit ?? B.coreR * 1.8), Math.sin(a * 2.3) * B.coreR * 0.5, Math.sin(a) * (B.orbit ?? B.coreR * 1.8)); sh.rotation.set(a, a * 1.7, 0.4); orbit.add(sh); } }
  // hanging tatters
  for (let i = 0; i < (B.tatters || 0); i++) { const a = (i / (B.tatters)) * Math.PI * 2; const piv = new THREE.Group(); piv.position.set(Math.cos(a) * B.coreR * (B.shape === 'hood' ? 1.7 : 0.6), -B.coreR * (B.shape === 'hood' ? 2.7 : 0.7), Math.sin(a) * B.coreR * (B.shape === 'hood' ? 1.7 : 0.6)); body.add(piv);
    const rag = cone(B.coreR * 0.22, B.coreR * 1.6, shade(C.body, -0.2), 5); rag.rotation.x = Math.PI; rag.position.y = -B.coreR * 0.8; rag.material.transparent = true; rag.material.opacity = 0.8; piv.add(rag); P.tatters.push({ piv, a }); }
  // tentacles
  for (let i = 0; i < (B.tentacles || 0); i++) { const a = (i / B.tentacles) * Math.PI * 2; let parent = new THREE.Group(); parent.position.set(Math.cos(a) * B.coreR * 0.7, -B.coreR * 0.55, Math.sin(a) * B.coreR * 0.7); body.add(parent); const chain = [];
    for (let k = 0; k < 4; k++) { const seg = new THREE.Group(); const l = B.coreR * 0.7, r = B.coreR * (0.16 - k * 0.03); const m = capsule(r, l, k % 2 ? C.belly : C.body); m.position.y = -l / 2; seg.add(m); seg.position.y = k === 0 ? 0 : -l; seg.rotation.x = k === 0 ? 0.35 : -0.18; parent.add(seg); parent = seg; chain.push(seg); }
    P.tentacles.push({ chain, a }); }
  // sleeve arms
  if (B.arms) for (const x of [-1, 1]) { const shoulder = new THREE.Group(); shoulder.position.set(x * B.coreR * (B.shape === 'hood' ? 0.85 : 1.0), -B.coreR * 0.35, B.coreR * (B.shape === 'hood' ? 0.45 : 0)); body.add(shoulder);
    const sleeve = capsule(B.coreR * 0.26, B.coreR * 1.0, C.body); sleeve.position.y = -B.coreR * 0.6; shoulder.add(sleeve);
    const hand = F.claws ? null : glowSphere(B.coreR * 0.22, C.eyes, 1.0, 10);
    if (hand) { hand.position.y = -B.coreR * 1.25; shoulder.add(hand); }
    else { const palm = sphere(B.coreR * 0.2, shade(C.body, -0.25), 10); palm.position.y = -B.coreR * 1.25; shoulder.add(palm); for (let i = -1; i <= 1; i++) { const cl = cone(B.coreR * 0.05, B.coreR * 0.45, C.belly, 5); cl.rotation.x = Math.PI; cl.position.set(i * B.coreR * 0.13, -B.coreR * 1.55, B.coreR * 0.05); shoulder.add(cl); } }
    P.arms.push({ shoulder, side: x }); }
  P.type = s.type; return P;
}
function animFloat(st) {
  const P = st.parts, t = st.t, an = st.anim, S = st.root; const size = st.spec.size;
  if (an === 'dead') { S.position.y = -(P.bodyY - P.coreR * 0.9) * size; S.rotation.z = 0.5; if (P.orbit) P.orbit.scale.setScalar(0.25); if (P.pulse) P.pulse.material.emissiveIntensity = 0.1; for (const tt of P.tatters) tt.piv.rotation.x = 0.9; for (const te of P.tentacles) for (const seg of te.chain) seg.rotation.x = 0.5; return; }
  S.position.y = 0; S.rotation.z = 0; if (P.orbit) P.orbit.scale.setScalar(1);
  const fast = an === 'run' || an === 'fly'; const atk = an === 'attack' ? (k => k < 0.3 ? k / 0.3 : Math.max(0, 1 - (k - 0.3) / 0.6))((t % 1.1) / 1.1) : 0;
  P.hip.position.y = P.bodyY + Math.sin(t * (fast ? 3.5 : 1.5)) * P.coreR * (fast ? 0.35 : 0.18) + atk * P.coreR * 0.3;
  P.hip.position.z = atk * P.coreR * 1.2 + (an === 'walk' ? Math.sin(t * 2) * 0.03 : 0);
  P.hip.rotation.x = atk * -0.25;
  if (P.orbit) { P.orbit.rotation.y += (fast ? 0.055 : 0.02) + atk * 0.06; P.orbit.rotation.z = Math.sin(t * 0.7) * 0.2; P.orbit.scale.setScalar(1 + atk * 0.45); }
  if (P.pulse) P.pulse.material.emissiveIntensity = 1.1 + Math.sin(t * (an === 'talk' ? 9 : 2.5)) * (an === 'talk' ? 0.6 : 0.3) + atk;
  P.head.rotation.y = an === 'idle' ? Math.sin(t * 0.45) * 0.3 : fast ? 0 : Math.sin(t * 0.9) * 0.12;
  P.head.rotation.z = Math.sin(t * 0.8) * 0.05;
  P.jaw.scale.setScalar(an === 'talk' ? 1 + Math.sin(t * 9) * 0.3 : atk > 0 ? 1 + atk * 0.6 : 1);
  for (const tt of P.tatters) { tt.piv.rotation.x = Math.sin(t * (fast ? 5 : 2) + tt.a) * (fast ? 0.5 : 0.22) - (fast ? 0.3 : 0); tt.piv.rotation.z = Math.cos(t * 1.7 + tt.a) * 0.15; }
  for (const te of P.tentacles) for (let k = 0; k < te.chain.length; k++) { te.chain[k].rotation.x = Math.sin(t * (fast ? 5 : 2.4) - k * 0.8 + te.a) * (0.18 + k * 0.12) + atk * 0.5; te.chain[k].rotation.z = Math.cos(t * 1.9 - k * 0.6 + te.a) * (0.12 + k * 0.08); }
  for (const a of P.arms) { a.shoulder.rotation.x = Math.sin(t * (fast ? 4 : 1.6) + (a.side < 0 ? 0 : 1)) * 0.15 - atk * 1.4; a.shoulder.rotation.z = a.side * (0.18 + Math.sin(t * 1.2) * 0.08); }
}
