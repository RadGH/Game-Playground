// Procedural Mii-style creatures (non-humanoid) from Three.js primitives: quadrupeds (wolves, bears, hounds, cats,
// frogs...), a spider, fliers (bat, owl, moth), serpents (snake, worm), winged dragons, bipeds (golem, titan, imp)
// and floaters (elemental, wisp, shard, wraith, horror). Same interface as createMiiCharacter: { group, update(dt,t), setAnim(name), setSpec(spec), dispose() }.
//
// Creature JSON (a character document can carry it as `creature`; when present, use it instead of `avatar` for 3D):
//   { type: 'wolf' | 'dire_wolf' | 'boar' | 'bear' | 'rat' | 'horse' | 'deer' | 'bat' | 'spider' | 'snake' | 'drake' | 'dragon'
//           | 'hound' | 'cat' | 'frog' | 'owl' | 'moth' | 'worm' | 'golem' | 'titan' | 'imp' | 'elemental' | 'wisp' | 'shard' | 'wraith' | 'horror',
//     size: 1 (scale multiplier), colors: { body, belly, accent, eyes }, seed,
//     features: { horns, wings, tail, mane, tusks, spikes, claws, fangs, core, glow, bulgeEyes, beak, antennae, maw, plates,
//                 trunk, howdah (quad), feathers (bat), spine, ribs (biped) } (overrides) }
// Animations: idle · walk · run · attack (lunge/bite) · dead · talk (mouth open, for growls) · fly (bat/dragon)
import * as THREE from 'three';
import { shade } from '../../avatar-2d/js/render.js';

function mat(color, extra = {}) { return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.9, metalness: 0, ...extra }); }
function mesh(geo, color) { const m = new THREE.Mesh(geo, mat(color)); m.castShadow = true; m.receiveShadow = false; return m; }
/**
 * DETAIL (2026-10-03): segment counts scale by this while a body is being built, so a game that draws
 * hundreds of animals as baked static poses (creature-poses.js) can ask for `{ detail: 0.35 }` and get
 * a few hundred triangles per animal instead of several thousand. 1 = the normal look.
 */
let DETAIL = 1;
const seg = (n, min) => Math.max(min, Math.round(n * DETAIL));
const sphere = (r, c, s = 18) => mesh(new THREE.SphereGeometry(r, seg(s, 5), seg(s, 4)), c);
const capsule = (r, l, c) => mesh(new THREE.CapsuleGeometry(r, l, seg(5, 1), seg(12, 5)), c);
const cone = (r, h, c, s = 12) => mesh(new THREE.ConeGeometry(r, h, seg(s, 4)), c);
const cyl = (rt, rb, h, c, s = 12) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg(s, 4)), c);
const box = (w, h, d, c) => mesh(new THREE.BoxGeometry(w, h, d), c);
function glowMat(color, intensity = 0.9) { return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.55, metalness: 0 }); }
function glowMesh(geo, color, intensity) { const m = new THREE.Mesh(geo, glowMat(color, intensity)); m.castShadow = false; return m; }
const glowSphere = (r, c, i = 0.9, s = 14) => glowMesh(new THREE.SphereGeometry(r, seg(s, 5), seg(s, 4)), c, i);
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

/** Build a creature. `opts.detail` (0.25..1) lowers segment counts for crowds (see DETAIL). */
export async function createCreature(spec, opts = {}) {
  const detail = Math.max(0.2, Math.min(1, opts.detail ?? 1));
  const group = new THREE.Group(); group.userData.character = true;
  const state = { anim: 'idle', t: 0, rate: 1, spec: null, parts: {}, plan: null, root: null };
  function clear() { while (group.children.length) { disposeObj(group.children[0]); group.remove(group.children[0]); } }
  function disposeObj(o) { o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }); }
  function build(sp) {
    const s = normalizeCreature(sp); state.spec = s; clear(); const T = CREATURE_TYPES[s.type]; state.plan = T.plan;
    const root = new THREE.Group(); root.scale.setScalar(s.size); group.add(root); state.root = root;
    DETAIL = detail;
    try { state.parts = ({ quad: buildQuad, spider: buildSpider, bat: buildBat, snake: buildSnake, biped: buildBiped, float: buildFloat, roller: buildRoller, fowl: buildFowl })[T.plan](root, T, s); } finally { DETAIL = 1; }
  }
  build(spec);
  return {
    group,
    get anim() { return state.anim; },
    /**
     * THE STUTTER. `setAnim` reset the clock EVERY TIME it was called, and the game calls it once
     * a frame ("play walk") — so `state.t` was never more than one frame's dt and every creature
     * in the game was frozen on the first sixteen milliseconds of its gait, jittering with the
     * frame time instead of walking. The humanoid rig has had this guard since it was written
     * (chibi2.js: `if (next === action && !ONE_SHOTS.has(name)) return;`); the beasts never did.
     */
    setAnim(n) { if (n === state.anim) return; state.anim = n; state.t = 0; },
    /**
     * How fast the gait runs, so four legs cover the ground the body is actually covering. The
     * clip speeds below are radians a second for a creature travelling at its designed pace; this
     * scales that, the same way `setRate` does for the humanoid.
     */
    setRate(r) { state.rate = Math.max(0.15, Math.min(3, Number(r) || 1)); },
    get rate() { return state.rate; },
    setSpec(sp) { build(sp); }, get spec() { return state.spec; },
    metrics() { const b = new THREE.Box3().setFromObject(group); return { height: b.max.y - b.min.y, length: b.max.z - b.min.z, width: b.max.x - b.min.x }; },
    update(dt, t) { state.t += dt * (state.rate || 1); const fn = ({ quad: animQuad, spider: animSpider, bat: animBat, snake: animSnake, biped: animBiped, float: animFloat, roller: animRoller, fowl: animFowl })[state.plan]; if (fn) fn(state, dt); },
    dispose() { clear(); },
  };
}

// ------------------------------------------------------------------ quadruped (faces +z)
function buildQuad(root, T, s) {
  const B = T.body, C = s.colors, F = s.features; const P = {};
  const isFrog = s.type === 'frog', isDragon = s.type === 'dragon' || s.type === 'drake';
  const bodyY = B.legLen + B.r * 0.9; const hip = new THREE.Group(); hip.position.y = bodyY; root.add(hip); P.hip = hip; P.bodyY = bodyY;
  const torso = capsule(B.r, B.len - B.r * 2, C.body); torso.rotation.x = Math.PI / 2; torso.scale.set(isFrog ? 1.18 : isDragon ? 1.08 : 1, isFrog ? 0.82 : 1, isFrog ? 1.12 : 1); hip.add(torso);
  const belly = capsule(B.r * 0.8, B.len - B.r * 2.2, C.belly); belly.rotation.x = Math.PI / 2; belly.position.y = -B.r * 0.35; hip.add(belly);
  if (isFrog) { const throat = sphere(B.r * 0.62, C.belly, 12); throat.position.set(0, -B.r * 0.54, B.len * 0.22); throat.scale.set(1.35, 0.45, 0.65); hip.add(throat); }
  if (F.mane) { const mane = capsule(B.r * 1.05, B.len * 0.35, C.accent); mane.rotation.x = Math.PI / 2; mane.position.set(0, B.r * 0.25, B.len * 0.22); hip.add(mane); }
  // PLATES (2026-10-03). The feature existed in the type table (turtle, crocodile) and nothing drew it
  // on a four-legged body. A `body.shell` type gets one domed shell; everything else gets a row of
  // overlapping armour plates down the spine, and any thorns grow out of the plates.
  if (F.plates && B.shell) {
    const dome = sphere(B.r * 1.22, shade(C.accent, 0.3), 18); dome.scale.set(1.0, 0.62, (B.len / 2 + B.r * 0.25) / (B.r * 1.22)); dome.position.y = B.r * 0.12; hip.add(dome);
    const rim = mesh(new THREE.TorusGeometry(B.r * 1.16, B.r * 0.09, 6, 22), C.belly); rim.rotation.x = Math.PI / 2; rim.scale.set(1, (B.len / 2 + B.r * 0.2) / (B.r * 1.16), 1); rim.position.y = -B.r * 0.12; hip.add(rim);
    // scutes: a spine row of three and two flank rows, each a low lens laid on the dome
    const domeTop = B.r * 0.12 + B.r * 1.22 * 0.62, half = B.len / 2 + B.r * 0.25;
    for (const [u, v] of [[0, -0.42], [0, 0], [0, 0.42], [-0.55, -0.25], [-0.55, 0.25], [0.55, -0.25], [0.55, 0.25]]) {
      const x = u * B.r * 1.22, z = v * half, k = Math.sqrt(Math.max(0.05, 1 - u * u - v * v)), sc = sphere(B.r * 0.36, shade(C.body, 0.1), 8);
      sc.scale.set(1, 0.2, 1.1); sc.position.set(x, B.r * 0.12 + (domeTop - B.r * 0.12) * k - B.r * 0.03, z); sc.rotation.set(v * 0.95, 0, -u * 0.95); hip.add(sc);
    }
  } else if (F.plates) {
    for (let i = 0; i < 5; i++) { const pl = sphere(B.r * (0.62 - Math.abs(i - 1.5) * 0.05), shade(C.body, -0.28), 10); pl.scale.set(1.25, 0.38, 0.85); pl.rotation.x = -0.28; pl.position.set(0, B.r * 0.86, B.len * (0.32 - i * 0.16)); hip.add(pl); }
  }
  if (F.spikes) for (let i = 0; i < 5; i++) { const sp = cone(B.r * 0.18, B.r * 0.5, C.accent, 6); sp.position.set(0, B.r * (F.plates && !B.shell ? 1.2 : 0.95), B.len * 0.4 - i * B.len * 0.2); if (F.plates && !B.shell) sp.rotation.x = -0.3; hip.add(sp); }
  if (F.howdah) buildHowdah(hip, B, C, P);
  // WOOL (the sheep): a fleece of overlapping lumps over the back and sides in the belly colour
  if (F.wool) for (let i = 0; i < 26; i++) { const t = i / 26, a = (i * 2.399) % (Math.PI * 2), z = (t - 0.5) * B.len * 0.95, sx = Math.sin(a) * B.r * 0.78, sy = Math.cos(a) * B.r * 0.62 + B.r * 0.2; if (sy < -B.r * 0.15) continue; const w = sphere(B.r * (0.48 + (i % 3) * 0.06), shade(C.belly, ((i * 7) % 5 - 2) * 0.025), 8); w.position.set(sx, sy, z); hip.add(w); }
  if (F.wool) { const tail = sphere(B.r * 0.3, C.belly, 8); tail.position.set(0, B.r * 0.35, -B.len / 2 - B.r * 0.15); hip.add(tail); }
  // SPOTS (the cow): flattened patches on the flanks and back in the accent colour
  if (F.spots) for (const [x, y, z, r] of [[0.95, 0.15, 0.25, 0.42], [-0.95, 0.3, -0.2, 0.5], [0.9, 0.35, -0.42, 0.32], [-0.4, 0.88, 0.32, 0.36], [0.3, 0.9, -0.3, 0.3], [-0.9, -0.1, 0.42, 0.28]]) { const sp = sphere(B.r * r, C.accent, 8); sp.scale.set(Math.abs(x) > 0.5 ? 0.25 : 1, Math.abs(x) > 0.5 ? 1 : 0.25, 1.3); sp.position.set(x * B.r * 0.98, y * B.r * 0.98, z * B.len * 0.5); hip.add(sp); }
  if (F.udder) { const u = sphere(B.r * 0.32, '#e8b4a8', 10); u.scale.set(1.1, 0.8, 1); u.position.set(0, -B.r * 0.9, -B.len * 0.25); hip.add(u); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const t = cyl(0.018, 0.012, 0.07, '#e8a49a', 5); t.position.set(x * B.r * 0.12, -B.r * 1.15, -B.len * 0.25 + z * B.r * 0.12); hip.add(t); } }
  // legs: pivots at the shoulder/hip, hanging down
  P.legs = [];
  const legX = B.r * 0.6, frontZ = B.len * 0.36, backZ = -B.len * 0.36;
  for (const [x, z, tag] of [[-legX, frontZ, 'FL'], [legX, frontZ, 'FR'], [-legX, backZ, 'BL'], [legX, backZ, 'BR']]) {
    const pivot = new THREE.Group(); pivot.position.set(x, -B.r * 0.4, z); hip.add(pivot);
    const rearFrog = isFrog && !tag.startsWith('F');
    const upper = capsule(B.legR * (rearFrog ? 1.7 : 1.15), B.legLen * (rearFrog ? 0.62 : 0.45), C.body); upper.position.y = -B.legLen * (rearFrog ? 0.34 : 0.25); upper.scale.z = rearFrog ? 1.35 : 1; pivot.add(upper);
    const knee = new THREE.Group(); knee.position.y = -B.legLen * 0.5; pivot.add(knee);
    const lower = capsule(B.legR, B.legLen * 0.42, shade(C.body, -0.1)); lower.position.y = -B.legLen * 0.25; knee.add(lower);
    const paw = F.hooves ? cyl(B.legR * 1.2, B.legR * 1.4, B.legR * 1.6, C.accent, 10) : sphere(B.legR * (rearFrog ? 2.1 : 1.5), F.claws ? C.accent : shade(C.body, -0.2), 10); paw.position.set(0, -B.legLen * 0.5 + B.legR * 0.6, B.legR * (rearFrog ? 0.75 : 0.4)); paw.scale.set(rearFrog ? 1.35 : 1, 0.7, rearFrog ? 1.8 : 1.3); knee.add(paw);
    if (isFrog) for (const toe of [-1, 0, 1]) { const t = sphere(B.legR * 0.34, C.belly, 8); t.position.set(toe * B.legR * 0.8, -B.legLen * 0.5, B.legR * (rearFrog ? 1.9 : 1.2)); t.scale.set(0.8, 0.45, 1.5); knee.add(t); }
    P.legs.push({ pivot, knee, tag, front: tag[0] === 'F', left: tag[1] === 'L' });
  }
  // neck + head
  const neck = new THREE.Group(); neck.position.set(0, B.r * 0.3, B.len / 2 - B.r * 0.2); hip.add(neck); P.neck = neck;
  const neckUp = B.neckUp ?? 0.35; const neckLen = B.neck;
  if (neckLen > 0.05) { const n = capsule(B.r * 0.55, neckLen, C.body); n.rotation.x = Math.PI / 2 - neckUp; n.position.set(0, Math.sin(neckUp) * neckLen / 2, Math.cos(neckUp) * neckLen / 2); neck.add(n); }
  const head = new THREE.Group(); head.position.set(0, Math.sin(neckUp) * neckLen + B.headR * 0.3, Math.cos(neckUp) * neckLen + B.headR * 0.4); neck.add(head); P.head = head;
  const skull = sphere(B.headR, C.body); skull.scale.set(isFrog ? 1.22 : isDragon ? 1.12 : 1, isFrog ? 0.82 : isDragon ? 1.08 : 1, isFrog ? 0.92 : isDragon ? 1.12 : 1); head.add(skull);
  const [sr, sl] = B.snout; const snout = capsule(sr, sl - sr, C.body); snout.rotation.x = Math.PI / 2; snout.position.set(0, -B.headR * 0.25, B.headR * 0.6 + sl / 2 - sr / 2); head.add(snout);
  const nose = F.snoutDisc ? cyl(sr * 0.95, sr * 0.95, sr * 0.3, C.nose || C.accent, 12) : sphere(sr * 0.45, C.nose || C.accent, 8); if (F.snoutDisc) nose.rotation.x = Math.PI / 2; nose.position.set(0, F.snoutDisc ? -B.headR * 0.25 : -B.headR * 0.12, B.headR * 0.6 + sl - sr * (F.snoutDisc ? -0.1 : 0.2)); head.add(nose);
  if (F.snoutDisc) for (const x of [-1, 1]) { const n = sphere(sr * 0.18, '#3a1e1e', 6); n.position.set(x * sr * 0.35, -B.headR * 0.25, B.headR * 0.6 + sl + sr * 0.07); head.add(n); }
  if (F.howdah) { const plate = sphere(B.headR * 0.62, C.accent, 10); plate.scale.set(1.15, 0.9, 0.35); plate.position.set(0, B.headR * 0.42, B.headR * 0.62); head.add(plate); const stud = cone(B.headR * 0.12, B.headR * 0.4, '#d8b060', 6); stud.rotation.x = 1.2; stud.position.set(0, B.headR * 0.5, B.headR * 0.86); head.add(stud); }
  if (isFrog) { const mouth = new THREE.Mesh(new THREE.TorusGeometry(B.headR * 0.48, B.headR * 0.035, 5, 16, Math.PI), mat(C.accent)); mouth.rotation.x = Math.PI / 2; mouth.position.set(0, -B.headR * 0.28, B.headR * 0.78); head.add(mouth); }
  if (isDragon) { for (const x of [-1, 1]) { const nostril = glowSphere(B.headR * 0.035, C.eyes, 0.3, 6); nostril.position.set(x * sr * 0.42, -B.headR * 0.12, B.headR * 0.6 + sl * 0.8); head.add(nostril); } }
  const jaw = new THREE.Group(); jaw.position.set(0, -B.headR * 0.45, B.headR * 0.5); head.add(jaw); P.jaw = jaw;
  const jawM = capsule(sr * 0.8, sl * 0.7, shade(C.body, -0.12)); jawM.rotation.x = Math.PI / 2; jawM.position.set(0, -sr * 0.2, sl * 0.4); jaw.add(jawM);
  if (F.fangs) for (const x of [-1, 1]) { const f = cone(sr * 0.14, sr * 0.5, '#f4f0e0', 6); f.rotation.x = Math.PI; f.position.set(x * sr * 0.45, -B.headR * 0.5, B.headR * 0.6 + sl * 0.75); head.add(f); }
  if (F.tusks && B.tuskLen) for (const x of [-1, 1]) {
    // long war tusks: out of the lip, forward and down, then curving up at the tip
    const L = sr * 1.2 * B.tuskLen, root2 = new THREE.Group(); root2.position.set(x * sr * 0.95, -B.headR * 0.42, B.headR * 0.62 + sl * 0.3); root2.rotation.set(1.9, 0, x * 0.22); head.add(root2);
    const base = cyl(sr * 0.2, sr * 0.3, L * 0.55, '#efe6cf', 8); base.position.y = L * 0.27; root2.add(base);
    const bend = new THREE.Group(); bend.position.y = L * 0.55; bend.rotation.x = -0.75; root2.add(bend);
    const tip = cone(sr * 0.2, L * 0.5, '#f6f0de', 8); tip.position.y = L * 0.25; bend.add(tip);
  } else if (F.tusks) for (const x of [-1, 1]) { const tk = cone(sr * 0.2, sr * 1.2, '#f0e8d0', 6); tk.position.set(x * sr * 0.7, -B.headR * 0.35, B.headR * 0.6 + sl * 0.6); tk.rotation.set(-0.6, 0, x * -0.4); head.add(tk); }
  if (F.trunk && B.trunk) {
    // a hanging trunk: a chain of groups from the snout, so it sways and curls like a tail does
    const TR = B.trunk, segL = TR.len / TR.segs; let parent = new THREE.Group(); parent.position.set(0, -B.headR * 0.18, B.headR * 0.6 + sl * 0.55); parent.rotation.x = -0.3; head.add(parent); P.trunk = [];
    for (let i = 0; i < TR.segs; i++) { const seg = new THREE.Group(); seg.position.y = i === 0 ? 0 : -segL; const r = TR.r * (1 - i * 0.11); const m = capsule(r, segL * 0.9, i % 2 ? C.body : shade(C.body, -0.06)); m.position.y = -segL / 2; seg.add(m); if (i === TR.segs - 1) { const lip = sphere(r * 1.15, shade(C.body, -0.18), 8); lip.position.y = -segL; lip.scale.set(1, 0.6, 1); seg.add(lip); } parent.add(seg); parent = seg; P.trunk.push(seg); }
  }
  const eyeR = B.headR * (F.bulgeEyes ? 0.36 : isDragon ? 0.19 : 0.16), eyeY = B.headR * (F.bulgeEyes ? 0.7 : isDragon ? 0.42 : 0.2), eyeX = B.headR * (F.bulgeEyes ? 0.55 : 0.45), eyeZ = B.headR * (F.bulgeEyes ? 0.35 : 0.75);
  for (const x of [-1, 1]) { const eye = sphere(eyeR, C.eyes, 10); eye.position.set(x * eyeX, eyeY, eyeZ); head.add(eye); const pupil = isDragon ? new THREE.Mesh(new THREE.CapsuleGeometry(eyeR * 0.18, eyeR * 0.75, 3, 6), mat('#16100b')) : sphere(eyeR * 0.42, '#111', 8); pupil.position.set(x * eyeX, eyeY + eyeR * 0.25, eyeZ + eyeR * 0.8); head.add(pupil); }
  if (T.ears === 'pointed') for (const x of [-1, 1]) { const e = cone(B.headR * 0.28, B.headR * 0.6, C.body, 8); e.position.set(x * B.headR * 0.55, B.headR * 0.9, -B.headR * 0.1); e.rotation.z = x * -0.3; head.add(e); const inner = cone(B.headR * 0.16, B.headR * 0.4, C.belly, 8); inner.position.set(x * B.headR * 0.55, B.headR * 0.85, -B.headR * 0.02); inner.rotation.z = x * -0.3; head.add(inner); }
  else if (T.ears === 'fan') for (const x of [-1, 1]) {
    // big flat ears that stand off the side of the skull (the tuskback)
    const e = cyl(B.headR * 0.78, B.headR * 0.62, B.headR * 0.07, shade(C.body, -0.04), 14); e.rotation.set(0.15, 0, Math.PI / 2 + x * 0.25); e.scale.set(1, 1, 1.25); e.position.set(x * B.headR * 1.0, B.headR * 0.12, -B.headR * 0.32); head.add(e);
    const inner = cyl(B.headR * 0.6, B.headR * 0.46, B.headR * 0.03, C.belly, 12); inner.rotation.copy(e.rotation); inner.scale.copy(e.scale); inner.position.set(x * B.headR * 1.04, B.headR * 0.12, -B.headR * 0.28); head.add(inner);
  }
  else if (T.ears === 'round') for (const x of [-1, 1]) { const e = sphere(B.headR * 0.28, C.body, 10); e.position.set(x * B.headR * 0.7, B.headR * 0.7, -B.headR * 0.1); head.add(e); const inner = sphere(B.headR * 0.16, C.belly, 8); inner.position.set(x * B.headR * 0.72, B.headR * 0.72, B.headR * 0.02); head.add(inner); }
  if (F.horns) for (const x of [-1, 1]) { const h = cone(B.headR * 0.18, B.headR * 1.1, C.accent, 7); h.position.set(x * B.headR * 0.5, B.headR * 0.9, -B.headR * 0.3); h.rotation.set(-0.7, 0, x * -0.35); head.add(h); }
  if (isDragon) for (let i = 0; i < 5; i++) { const crest = cone(B.headR * (0.10 - i * 0.01), B.headR * (0.45 - i * 0.04), C.accent, 6); crest.position.set(0, B.headR * (0.7 - i * 0.08), -B.headR * (0.34 - i * 0.18)); crest.rotation.x = -0.45; head.add(crest); }
  if (F.antlers) for (const x of [-1, 1]) { const a = new THREE.Group(); a.position.set(x * B.headR * 0.45, B.headR * 0.8, -B.headR * 0.2); a.rotation.z = x * -0.35; head.add(a); const main = cyl(0.012, 0.02, B.headR * 2.2, C.accent, 6); main.position.y = B.headR * 1.1; a.add(main); for (let i = 1; i <= 3; i++) { const tine = cyl(0.008, 0.015, B.headR * 0.8, C.accent, 6); tine.position.set(x * B.headR * 0.25, B.headR * (0.5 + i * 0.5), 0); tine.rotation.z = x * -0.9; a.add(tine); } }
  if (F.whiskers) for (const x of [-1, 1]) for (const dy of [-0.02, 0.02]) { const w = cyl(0.003, 0.003, sr * 3, '#ddd', 4); w.rotation.z = Math.PI / 2; w.rotation.y = x * 0.3; w.position.set(x * sr * 1.2, -B.headR * 0.15 + dy, B.headR * 0.6 + sl * 0.8); head.add(w); }
  // tail
  const tailPivot = new THREE.Group(); tailPivot.position.set(0, B.r * 0.4, -B.len / 2 + B.r * 0.3); hip.add(tailPivot); P.tail = tailPivot;
  const tl = B.tail; const segs = tl.len > 0.5 ? 4 : 2; let parent = tailPivot; P.tailSegs = [];
  for (let i = 0; i < segs; i++) { const seg = new THREE.Group(); const l = tl.len / segs; const r = tl.r * (1 - i / (segs + 1)); const m = capsule(r, l, tl.bare ? C.accent : (tl.hair ? C.accent : C.body)); m.rotation.x = Math.PI / 2; m.position.z = -l / 2; seg.add(m); if (tl.spiky) { const sp = cone(r * 0.6, r * 1.6, C.accent, 5); sp.position.set(0, r * 0.9, -l / 2); seg.add(sp); } seg.rotation.x = (i === 0 ? tl.up : tl.up * 0.35); parent.add(seg); seg.position.z = i === 0 ? 0 : -(tl.len / segs); parent = seg; P.tailSegs.push(seg); }
  if (tl.spiky && s.type === 'dragon') { const tip = cone(tl.r * 1.2, tl.r * 3, C.accent, 4); tip.rotation.x = Math.PI / 2; tip.position.z = -(tl.len / segs) - tl.r * 1.2; parent.add(tip); }
  // wings
  if (F.wings) { P.wings = []; for (const x of [-1, 1]) { const w = new THREE.Group(); w.position.set(x * B.r * 0.7, B.r * 0.7, B.len * 0.1); hip.add(w); const span = B.len * 0.9; const bone = cyl(0.03, 0.03, span, C.accent, 6); bone.rotation.z = x * -Math.PI / 2 + 0; bone.position.x = x * span / 2; w.add(bone); const membrane = mesh(new THREE.ShapeGeometry(wingShape(span, x)), C.belly); membrane.material.side = THREE.DoubleSide; membrane.material.transparent = true; membrane.material.opacity = 0.92; membrane.rotation.x = Math.PI / 2; w.add(membrane); P.wings.push({ group: w, side: x }); } }
  if (isDragon) for (let i = 0; i < 6; i++) { const scale = new THREE.Mesh(new THREE.TorusGeometry(B.r * 0.18, B.r * 0.035, 4, 8), mat(C.accent)); scale.position.set(0, B.r * (0.72 - i * 0.08), B.len * (0.32 - i * 0.13)); scale.rotation.x = Math.PI / 2; hip.add(scale); }
  P.type = s.type; return P;
}
/** Bat-style membrane: leading edge along the bone, scalloped trailing edge between three finger tips. */
function wingShape(span, x) { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(x * span, -span * 0.02); sh.quadraticCurveTo(x * span * 0.85, -span * 0.2, x * span * 0.78, -span * 0.5); sh.quadraticCurveTo(x * span * 0.62, -span * 0.32, x * span * 0.48, -span * 0.58); sh.quadraticCurveTo(x * span * 0.32, -span * 0.36, x * span * 0.16, -span * 0.5); sh.quadraticCurveTo(x * span * 0.06, -span * 0.3, 0, -span * 0.2); sh.closePath(); return sh; }
/**
 * A wooden fighting platform strapped on a big quad's back (the tuskback): a cloth saddle blanket,
 * a plank deck, four posts with rails, a peaked canopy and a banner pole. All static, so the mesh
 * merge folds it into the hip's single draw call. `colors.cloth` is the blanket, canopy and banner.
 */
function buildHowdah(hip, B, C, P) {
  const cloth = C.cloth || C.accent, wood = C.accent, top = B.r * 0.92, w = B.r * 1.25, d = B.len * 0.42;
  const blanket = box(B.r * 2.12, B.r * 0.16, d * 1.15, cloth); blanket.position.set(0, top - B.r * 0.08, -B.len * 0.02); hip.add(blanket);
  const trim = box(B.r * 2.18, B.r * 0.06, d * 1.2, shade(cloth, 0.35)); trim.position.set(0, top - B.r * 0.2, -B.len * 0.02); hip.add(trim);
  const deck = box(w, B.r * 0.1, d, shade(wood, 0.15)); deck.position.set(0, top + B.r * 0.06, -B.len * 0.02); hip.add(deck);
  const postH = B.r * 0.62;
  for (const x of [-1, 1]) for (const z of [-1, 1]) { const post = cyl(B.r * 0.035, B.r * 0.04, postH, wood, 6); post.position.set(x * w * 0.44, top + B.r * 0.1 + postH / 2, -B.len * 0.02 + z * d * 0.44); hip.add(post); }
  for (const x of [-1, 1]) { const rail = box(B.r * 0.04, B.r * 0.05, d * 0.9, wood); rail.position.set(x * w * 0.44, top + B.r * 0.36, -B.len * 0.02); hip.add(rail); }
  for (const z of [-1, 1]) { const rail = box(w * 0.9, B.r * 0.05, B.r * 0.04, wood); rail.position.set(0, top + B.r * 0.36, -B.len * 0.02 + z * d * 0.44); hip.add(rail); }
  const roof = cone(w * 0.78, B.r * 0.5, cloth, 4); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, d / w); roof.position.set(0, top + B.r * 0.1 + postH + B.r * 0.22, -B.len * 0.02); hip.add(roof);
  const pole = cyl(B.r * 0.025, B.r * 0.025, B.r * 1.5, wood, 5); pole.position.set(w * 0.4, top + B.r * 0.85, -B.len * 0.02 - d * 0.44); hip.add(pole);
  const flag = box(B.r * 0.02, B.r * 0.42, B.r * 0.55, cloth); flag.position.set(w * 0.4, top + B.r * 1.38, -B.len * 0.02 - d * 0.44 - B.r * 0.28); hip.add(flag);
  const tip = sphere(B.r * 0.05, '#d8b060', 6); tip.position.set(w * 0.4, top + B.r * 1.62, -B.len * 0.02 - d * 0.44); hip.add(tip);
  P.howdah = true;
}
function animQuad(st, dt) {
  const P = st.parts, t = st.t, an = st.anim; const S = st.root;
  if (an === 'dead') { S.rotation.z = Math.PI / 2; S.position.y = P.bodyY * 0.35 * st.spec.size; for (const l of P.legs) { l.pivot.rotation.x = 0.4; l.knee.rotation.x = 0.6; } P.jaw.rotation.x = 0.35; return; }
  S.rotation.z = 0; S.position.y = 0;
  const panic = an === 'panic';
  const moving = an === 'walk' || an === 'run' || an === 'fly' || panic; const speed = an === 'run' ? 12 : panic ? 14 : an === 'fly' ? 6 : 6.5; const amp = an === 'run' || panic ? 0.7 : an === 'walk' ? 0.4 : 0;
  for (const l of P.legs) { const phase = (l.front ? 0 : Math.PI) + (l.left ? 0 : Math.PI) + (an === 'run' && !l.front ? Math.PI * 0.8 : 0); const sw = Math.sin(t * speed + phase) * amp; l.pivot.rotation.x = sw; l.knee.rotation.x = Math.max(0, -sw) * 1.2 + (moving ? 0.15 : 0.05); }
  P.hip.position.y = P.bodyY + (moving ? Math.abs(Math.sin(t * speed)) * 0.03 * st.spec.size : Math.sin(t * 1.5) * 0.008) + (an === 'fly' ? 0.6 + Math.sin(t * 6) * 0.08 : 0);
  P.hip.rotation.x = an === 'run' ? Math.sin(t * speed) * 0.06 : 0;
  P.neck.rotation.x = an === 'idle' ? Math.sin(t * 0.7) * 0.06 : an === 'attack' ? 0 : -0.1; P.neck.rotation.y = an === 'idle' ? Math.sin(t * 0.45) * 0.25 : 0;
  P.jaw.rotation.x = an === 'talk' ? 0.25 + Math.sin(t * 9) * 0.2 : an === 'attack' ? 0.5 : 0.02;
  // GRAZE: the head goes down to the grass and the jaw chews; now and then it looks up
  if (an === 'graze') { const up = Math.max(0, Math.sin(t * 0.55) - 0.82) * 5; P.neck.rotation.x = 0.95 - up * 0.9; P.neck.rotation.y = Math.sin(t * 0.3) * 0.15; P.jaw.rotation.x = 0.06 + Math.abs(Math.sin(t * 4.5)) * 0.14; }
  // BLEAT: head up, mouth wide, held for a beat, repeating
  if (an === 'bleat') { const k = (t % 1.6) / 1.6, open = k < 0.55 ? Math.sin(k / 0.55 * Math.PI) : 0; P.neck.rotation.x = -0.35 * open - 0.05; P.jaw.rotation.x = 0.05 + open * 0.5; }
  // PANIC: a flat-out gallop with the head tossing and the mouth open (a fleeing flock)
  if (panic) { P.neck.rotation.x = -0.3 + Math.sin(t * 9) * 0.25; P.neck.rotation.y = Math.sin(t * 5.3) * 0.35; P.jaw.rotation.x = 0.3 + Math.sin(t * 13) * 0.15; P.hip.rotation.z = Math.sin(t * 7) * 0.06; } else if (P.hip) P.hip.rotation.z = 0;
  if (an === 'attack') { const k = (t % 0.9) / 0.9; const lunge = k < 0.35 ? k / 0.35 : Math.max(0, 1 - (k - 0.35) / 0.5); P.neck.rotation.x = -0.35 * lunge; P.hip.position.z = lunge * 0.25; P.hip.rotation.x = -0.15 * lunge; for (const l of P.legs) if (l.front) l.pivot.rotation.x = -0.9 * lunge; } else P.hip.position.z = 0;
  for (let i = 0; i < P.tailSegs.length; i++) P.tailSegs[i].rotation.y = Math.sin(t * (moving ? 5 : 2) + i * 0.7) * (0.25 + i * 0.1) * (an === 'idle' ? 1 : 1.4);
  if (P.wings) for (const w of P.wings) w.group.rotation.z = w.side * (an === 'fly' ? Math.sin(t * 7) * 0.7 : an === 'attack' ? 0.9 : 0.55 + Math.sin(t * 1.2) * 0.05);
  // the trunk swings with the walk, and curls up and forward to strike
  if (P.trunk) { const atk = an === 'attack' ? Math.max(0, Math.sin(((t % 0.9) / 0.9) * Math.PI)) : 0; for (let i = 0; i < P.trunk.length; i++) { P.trunk[i].rotation.x = -atk * (0.35 + i * 0.12) + Math.sin(t * (moving ? 4 : 1.3) + i * 0.6) * (moving ? 0.1 : 0.05); P.trunk[i].rotation.z = Math.sin(t * (moving ? speed * 0.5 : 0.9) + i * 0.5) * (moving ? 0.12 : 0.06); } }
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
  if (F.beak) { const long = F.feathers ? 1.5 : 1; const bk = cone(B.headR * 0.3, B.headR * 0.75 * long, C.accent, 8); bk.rotation.x = Math.PI / 2; bk.position.set(0, -B.headR * 0.1, B.headR * (0.95 + (long - 1) * 0.35)); head.add(bk); }
  if (F.antennae) for (const x of [-1, 1]) { const a = cyl(0.004, 0.008, B.headR * 1.6, C.accent, 5); a.position.set(x * B.headR * 0.35, B.headR * 1.1, B.headR * 0.3); a.rotation.set(-0.5, 0, x * -0.5); head.add(a); const tip = sphere(B.headR * 0.12, C.belly, 8); tip.position.set(x * B.headR * 0.95, B.headR * 1.75, B.headR * 0.75); head.add(tip); }
  for (const x of [-1, 1]) { const e = sphere(B.headR * 0.2, C.eyes, 8); e.position.set(x * B.headR * 0.4, B.headR * 0.15, B.headR * 0.8); head.add(e); if (T.ears === 'none') continue; const ear = cone(B.headR * 0.35, B.headR * 1.1, C.body, 6); ear.position.set(x * B.headR * 0.5, B.headR * 1.1, -B.headR * 0.1); ear.rotation.z = x * -0.25; head.add(ear); const inner = cone(B.headR * 0.2, B.headR * 0.8, C.accent, 6); inner.position.set(x * B.headR * 0.5, B.headR * 1.0, B.headR * 0.02); inner.rotation.z = x * -0.25; head.add(inner); }
  if (F.feathers) buildFeatheredWings(body, B, C, P);
  else for (const x of [-1, 1]) { const w = new THREE.Group(); w.position.set(x * B.r * 0.6, B.r * 0.3, 0); body.add(w); const half = B.span / 2; const arm = cyl(0.015, 0.015, half, C.accent, 5); arm.rotation.z = Math.PI / 2; arm.position.x = x * half / 2; w.add(arm); for (let f = 1; f <= 3; f++) { const fin = cyl(0.008, 0.008, half * 0.75, C.accent, 4); fin.position.set(x * half * (0.55 + f * 0.13), -half * 0.28, 0); fin.rotation.z = x * (0.5 + f * 0.35); w.add(fin); } const mem = mesh(new THREE.ShapeGeometry(wingShape(half, x)), C.accent); mem.material.side = THREE.DoubleSide; w.add(mem); P.wings.push({ group: w, side: x }); }
  for (const x of [-1, 1]) { const foot = capsule(0.012, 0.06, C.accent); foot.position.set(x * B.r * 0.3, -B.r * 0.9, -B.r * 0.2); body.add(foot); }
  return P;
}
/**
 * FEATHERED WINGS (2026-10-03, the crow). A bird's wing is a fan of blades, not a membrane between
 * fingers: a covert pad along the arm, six primaries that lengthen toward the tip and sweep back,
 * and a fan of tail feathers. Same `P.wings` groups as the bat, so the flap animation is shared.
 */
function buildFeatheredWings(body, B, C, P) {
  const half = B.span / 2;
  for (const x of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(x * B.r * 0.6, B.r * 0.35, -B.r * 0.1); body.add(w);
    const covert = sphere(half * 0.3, C.body, 10); covert.scale.set(1.7, 0.16, 0.9); covert.position.set(x * half * 0.32, 0, -half * 0.06); w.add(covert);
    for (let f = 0; f < 6; f++) {
      const len = half * (0.42 + f * 0.07), along = half * (0.22 + f * 0.13);
      const blade = sphere(1, f % 2 ? C.belly : C.body, 6); blade.scale.set(half * 0.075, half * 0.018, len * 0.5);
      blade.position.set(x * along, -half * 0.005 * f, -len * 0.42); blade.rotation.y = x * (0.12 + f * 0.13); w.add(blade);
    }
    const edge = capsule(half * 0.035, half * 0.8, C.accent); edge.rotation.z = Math.PI / 2; edge.position.set(x * half * 0.45, half * 0.02, half * 0.02); w.add(edge);
    P.wings.push({ group: w, side: x });
  }
  const tail = new THREE.Group(); tail.position.set(0, -B.r * 0.55, -B.r * 0.65); tail.rotation.x = -0.5; body.add(tail);
  for (let i = -2; i <= 2; i++) { const f = sphere(1, i % 2 ? C.belly : C.body, 6); f.scale.set(B.r * 0.2, B.r * 0.05, B.r * 1.05); f.position.set(i * B.r * 0.12, 0, -B.r * 0.95); f.rotation.y = i * 0.16; tail.add(f); }
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
  const crouch = B.crouch || 0; P.bodyY = B.legLen * Math.cos(crouch); const hip = new THREE.Group(); hip.position.y = P.bodyY; root.add(hip); P.hip = hip;
  // THE CHEST (2026-10-03). Everything above the pelvis hangs off one group, so `body.hunch` can tip
  // the upper body forward (the ghoul) while the legs stay planted. At hunch 0 it is the old body.
  const chest = new THREE.Group(); chest.rotation.x = B.hunch || 0; hip.add(chest); P.chest = chest;
  const ribs = !!F.ribs, bony = !!B.bony;
  const torso = blocky ? box(B.torsoR * 2, B.torsoH, B.torsoR * 1.35, C.body) : capsule(B.torsoR, Math.max(0.02, B.torsoH - B.torsoR * 2), C.body);
  torso.position.y = B.torsoH * 0.5; if (!ribs) chest.add(torso);
  const belly = blocky ? box(B.torsoR * 1.4, B.torsoH * 0.42, B.torsoR * 0.3, C.belly) : capsule(B.torsoR * 0.68, B.torsoH * 0.3, C.belly);
  belly.position.set(0, B.torsoH * 0.4, B.torsoR * (blocky ? 0.7 : 0.45)); if (!ribs) chest.add(belly);
  const pelvis = bony ? sphere(B.torsoR * 0.42, shade(C.body, -0.08), 10) : blocky ? box(B.torsoR * 1.7, B.torsoR * 0.7, B.torsoR * 1.2, shade(C.body, -0.12)) : sphere(B.torsoR * 0.8, shade(C.body, -0.12), 12); hip.add(pelvis);
  if (bony) { pelvis.scale.set(1.7, 0.55, 0.9); pelvis.position.y = B.torsoR * 0.05; for (const x of [-1, 1]) { const wing = sphere(B.torsoR * 0.3, C.body, 10); wing.scale.set(1.1, 0.8, 0.45); wing.position.set(x * B.torsoR * 0.5, B.torsoR * 0.22, -B.torsoR * 0.05); wing.rotation.z = x * 0.5; hip.add(wing); } }
  if (ribs) buildRibcage(chest, B, C);
  if (F.core) { const core = glowSphere(B.torsoR * 0.34, C.eyes, 1.1, 12); core.position.set(0, B.torsoH * 0.62, ribs ? 0 : B.torsoR * (blocky ? 0.72 : 0.5)); chest.add(core);
    if (ribs) { const halo = glowSphere(B.torsoR * 0.5, C.eyes, 0.5, 12); halo.material.transparent = true; halo.material.opacity = 0.35; halo.material.depthWrite = false; core.add(halo); core.scale.setScalar(0.85); } P.core = core; }
  if (F.spikes) for (let i = 0; i < 3; i++) { const sp = cone(B.torsoR * 0.16, B.torsoR * 0.7, C.accent, 6); sp.position.set(0, B.torsoH * (0.35 + i * 0.25), -B.torsoR * (ribs ? 0.62 : blocky ? 0.7 : 0.55)); sp.rotation.x = ribs ? -0.5 : 0.5; chest.add(sp); }
  if (F.spine) for (let i = 0; i < 5; i++) { const v = sphere(B.torsoR * 0.17, shade(C.body, -0.1), 8); v.scale.set(1, 0.7, 1); v.position.set(0, B.torsoH * (0.2 + i * 0.17), -B.torsoR * 0.92); chest.add(v); }
  // legs
  for (const x of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(x * B.torsoR * 0.52, 0, 0); hip.add(pivot);
    const upper = blocky ? box(B.legR * 2, B.legLen * 0.52, B.legR * 2, C.body) : capsule(B.legR * (bony ? 0.55 : 1), B.legLen * 0.4, C.body); upper.position.y = -B.legLen * 0.26; pivot.add(upper);
    if (bony) { const kn = sphere(B.legR * 0.95, shade(C.body, -0.06), 10); kn.position.y = -B.legLen * 0.5; pivot.add(kn); }
    const knee = new THREE.Group(); knee.position.y = -B.legLen * 0.5; pivot.add(knee);
    const lower = blocky ? box(B.legR * 1.8, B.legLen * 0.46, B.legR * 1.8, shade(C.body, -0.1)) : capsule(B.legR * (bony ? 0.5 : 0.85), B.legLen * 0.36, shade(C.body, -0.1)); lower.position.y = -B.legLen * 0.24; knee.add(lower);
    const foot = box(B.legR * 2.2, B.legR * 0.9, B.legR * 3.2, C.accent); foot.position.set(0, -B.legLen * 0.5 + B.legR * 0.45, B.legR * 0.7); knee.add(foot);
    P.legs.push({ pivot, knee, side: x, base: -crouch, kbase: crouch * 2 });
  }
  // arms
  for (const x of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(x * (B.torsoR + B.armR * 0.5), B.torsoH * 0.84, 0); chest.add(shoulder);
    const pad = blocky ? box(B.armR * 2.6, B.armR * 2.2, B.armR * 2.6, shade(C.body, 0.1)) : sphere(B.armR * 1.45, shade(C.body, 0.1), 12); shoulder.add(pad);
    if (F.spikes) { const sp = cone(B.armR * 0.7, B.armR * 2, C.accent, 6); sp.position.y = B.armR * 1.6; sp.rotation.z = x * 0.35; shoulder.add(sp); }
    const upper = blocky ? box(B.armR * 1.8, B.armLen * 0.5, B.armR * 1.8, C.body) : capsule(B.armR * (bony ? 0.55 : 1), B.armLen * 0.38, C.body); upper.position.y = -B.armLen * 0.25; shoulder.add(upper);
    if (bony) { const el2 = sphere(B.armR * 0.9, shade(C.body, -0.06), 10); el2.position.y = -B.armLen * 0.5; shoulder.add(el2); }
    const elbow = new THREE.Group(); elbow.position.y = -B.armLen * 0.5; shoulder.add(elbow);
    const lower = blocky ? box(B.armR * 1.6, B.armLen * 0.46, B.armR * 1.6, shade(C.body, -0.08)) : capsule(B.armR * (bony ? 0.5 : 0.85), B.armLen * 0.36, shade(C.body, -0.08)); lower.position.y = -B.armLen * 0.24; elbow.add(lower);
    const hand = blocky ? box(B.armR * 2.3, B.armR * 2.3, B.armR * 2.3, shade(C.body, -0.16)) : sphere(B.armR * 1.3, shade(C.body, -0.16), 12); hand.position.y = -B.armLen * 0.48; elbow.add(hand);
    if (F.claws) for (let i = -1; i <= 1; i++) { const cl = cone(B.armR * 0.3, B.armR * 1.5, C.accent, 5); cl.rotation.x = Math.PI * 0.5 + 0.6; cl.position.set(i * B.armR * 0.8, -B.armLen * 0.52, B.armR * 1.1); elbow.add(cl); }
    P.arms.push({ shoulder, elbow, side: x, base: -(B.hunch || 0) * 0.85 });
  }
  // neck + head
  const neck = new THREE.Group(); neck.position.y = B.torsoH + (B.neck || 0); chest.add(neck); P.neck = neck;
  const head = new THREE.Group(); head.position.set(0, B.headR * 0.85, B.hunch ? B.headR * 0.35 : 0); head.rotation.x = -(B.hunch || 0) * 0.95; neck.add(head); P.head = head;
  if (F.sack) buildSackHead(head, B, C, P, F);
  const skull = blocky ? box(B.headR * 1.7, B.headR * 1.8, B.headR * 1.6, C.body) : sphere(B.headR, F.sack ? C.belly : C.body); skull.visible = !F.sack; if (!F.sack) head.add(skull);
  if (!F.sack) { const brow = blocky ? box(B.headR * 1.8, B.headR * 0.35, B.headR * 0.4, C.accent) : capsule(B.headR * 0.16, B.headR * 1.3, bony ? C.body : C.accent); if (!blocky) brow.rotation.z = Math.PI / 2; brow.position.set(0, B.headR * 0.42, B.headR * 0.72); head.add(brow); }
  if (!F.sack) for (const x of [-1, 1]) { const eye = glowSphere(B.headR * (bony ? 0.13 : 0.2), C.eyes, bony ? 1.6 : 1.1, 10); eye.position.set(x * B.headR * 0.42, B.headR * 0.12, B.headR * (bony ? 0.8 : 0.76)); head.add(eye);
    if (bony) { const socket = sphere(B.headR * 0.27, '#14161a', 10); socket.scale.z = 0.5; socket.position.set(x * B.headR * 0.42, B.headR * 0.12, B.headR * 0.78); head.add(socket); } }
  if (bony) { for (let i = -2; i <= 2; i++) { const tooth = box(B.headR * 0.13, B.headR * 0.2, B.headR * 0.08, '#efe8d4'); tooth.position.set(i * B.headR * 0.16, -B.headR * 0.5, B.headR * 0.78); head.add(tooth); }
    const nose = cone(B.headR * 0.1, B.headR * 0.2, '#14161a', 3); nose.rotation.x = Math.PI; nose.position.set(0, -B.headR * 0.12, B.headR * 0.9); head.add(nose); }
  const jaw = new THREE.Group(); jaw.position.set(0, -B.headR * 0.5, B.headR * 0.12); head.add(jaw); P.jaw = jaw;
  const jawM = blocky ? box(B.headR * 1.4, B.headR * 0.55, B.headR * 1.3, shade(C.body, -0.14)) : capsule(B.headR * 0.5, B.headR * 0.35, shade(C.body, -0.14)); jawM.position.set(0, -B.headR * 0.1, B.headR * 0.2); if (!F.sack) jaw.add(jawM);
  if (F.straw) buildStrawTufts(P, B, chest);
  if (F.fangs) for (const x of [-1, 1]) { const f = cone(B.headR * 0.12, B.headR * 0.42, '#f4f0e0', 5); f.rotation.x = Math.PI; f.position.set(x * B.headR * 0.35, -B.headR * 0.42, B.headR * 0.55); head.add(f); }
  if (F.horns) for (const x of [-1, 1]) { const h = cone(B.headR * 0.22, B.headR * 1.3, C.accent, 7); h.position.set(x * B.headR * 0.6, B.headR * 0.85, -B.headR * 0.1); h.rotation.set(-0.35, 0, x * -0.5); head.add(h); }
  // tail (imps)
  P.tailSegs = [];
  if (F.tail) { let parent = new THREE.Group(); parent.position.set(0, B.torsoR * 0.2, -B.torsoR * 0.9); hip.add(parent); P.tail = parent;
    for (let i = 0; i < 4; i++) { const seg = new THREE.Group(); const l = B.torsoH * 0.36, r = B.armR * (0.9 - i * 0.15); const m = capsule(r, l, C.body); m.rotation.x = Math.PI / 2; m.position.z = -l / 2; seg.add(m); seg.rotation.x = i === 0 ? -0.5 : 0.25; seg.position.z = i === 0 ? 0 : -l; parent.add(seg); parent = seg; P.tailSegs.push(seg); }
    const spade = cone(B.armR * 1.1, B.armR * 2.6, C.accent, 4); spade.rotation.x = -Math.PI / 2; spade.position.z = -B.torsoH * 0.5; parent.add(spade); }
  // wings
  if (F.wings) { P.wings = []; for (const x of [-1, 1]) { const w = new THREE.Group(); w.position.set(x * B.torsoR * 0.7, B.torsoH * 0.78, -B.torsoR * 0.5); chest.add(w); const span = B.torsoH * 1.5; const bone = cyl(B.armR * 0.35, B.armR * 0.35, span, C.accent, 6); bone.rotation.z = x * -Math.PI / 2; bone.position.x = x * span / 2; w.add(bone); const mem = mesh(new THREE.ShapeGeometry(wingShape(span, x)), C.belly); mem.material.side = THREE.DoubleSide; mem.material.transparent = true; mem.material.opacity = 0.92; w.add(mem); P.wings.push({ group: w, side: x }); } }
  P.type = s.type; return P;
}
/**
 * A RIB CAGE in place of a solid torso (the bone colossus): a spine of vertebrae, six ribs that open
 * at the front so the glowing core shows through, collar bones and a sternum-less front. Rings are
 * flattened front-to-back like a real chest.
 */
function buildRibcage(chest, B, C) {
  const H = B.torsoH, R = B.torsoR;
  for (let i = 0; i < 7; i++) { const v = cyl(R * 0.13, R * 0.15, H * 0.1, shade(C.body, -0.05), 8); v.position.set(0, H * (0.06 + i * 0.14), -R * 0.55); chest.add(v); }
  for (let i = 0; i < 6; i++) {
    const k = i / 5, rr = R * (0.72 + Math.sin(k * Math.PI) * 0.3), hold = new THREE.Group();
    hold.position.set(0, H * (0.28 + k * 0.6), -R * 0.12); hold.rotation.x = -Math.PI / 2; hold.scale.set(1, 0.78, 1); chest.add(hold);
    const rib = mesh(new THREE.TorusGeometry(rr, B.armR * 0.32, 6, 18, Math.PI * 1.45), C.body); rib.rotation.z = -Math.PI * 0.225; hold.add(rib);
  }
  for (const x of [-1, 1]) { const collar = capsule(B.armR * 0.3, R * 0.8, C.body); collar.rotation.z = Math.PI / 2 + x * 0.15; collar.position.set(x * R * 0.48, H * 0.9, R * 0.05); chest.add(collar); }
}
/**
 * A SACK HEAD (the scarecrow): a burlap bag tied at the neck with a cord, a stitched X for one eye and a
 * glowing button for the other, a stitched grin, and a floppy brimmed hat in the accent colour.
 */
function buildSackHead(head, B, C, P, F) {
  const R = B.headR, burlap = C.belly;
  const bag = sphere(R, burlap, 14); bag.scale.set(1.05, 1.12, 1.0); head.add(bag);
  const tie = mesh(new THREE.TorusGeometry(R * 0.55, R * 0.08, 6, 14), shade(burlap, -0.35)); tie.rotation.x = Math.PI / 2; tie.position.y = -R * 0.82; head.add(tie);
  for (let i = 0; i < 5; i++) { const t = cone(R * 0.12, R * 0.5, shade(burlap, -0.1), 4); const a = i / 5 * Math.PI * 2; t.position.set(Math.cos(a) * R * 0.5, -R * 1.02, Math.sin(a) * R * 0.5); t.rotation.set(Math.PI + Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); head.add(t); }
  const stitch = '#2a2018';
  for (const r of [0.7, -0.7]) { const b = box(R * 0.42, R * 0.07, R * 0.06, stitch); b.position.set(-R * 0.38, R * 0.15, R * 0.93); b.rotation.z = r; head.add(b); }
  const eye = glowSphere(R * 0.16, C.eyes, 1.4, 10); eye.position.set(R * 0.38, R * 0.15, R * 0.9); head.add(eye);
  const jaw = P.jaw || head;
  for (let i = -3; i <= 3; i++) { const m = box(R * 0.06, R * (i % 2 ? 0.18 : 0.06), R * 0.06, stitch); m.position.set(i * R * 0.12, -R * 0.32 - Math.abs(i) * R * 0.03 * -1 + Math.abs(i) * R * 0.035, R * 0.92 - Math.abs(i) * R * 0.04); head.add(m); }
  if (F.hat !== false) {
    const brim = cyl(R * 1.7, R * 1.75, R * 0.07, C.accent, 18); brim.position.y = R * 0.78; brim.rotation.set(0.12, 0, -0.08); head.add(brim);
    const crown = cyl(R * 0.62, R * 0.8, R * 0.7, C.accent, 10); crown.position.set(0, R * 1.15, -R * 0.03); crown.rotation.z = -0.12; head.add(crown);
    const tip = cone(R * 0.55, R * 0.55, C.accent, 9); tip.position.set(-R * 0.25, R * 1.55, 0); tip.rotation.z = 0.9; head.add(tip);
    const band = cyl(R * 0.74, R * 0.78, R * 0.14, shade(C.accent, -0.4), 12); band.position.y = R * 0.92; head.add(band);
  }
}
/** Straw sticking out of the cuffs, the collar and the trouser legs (the scarecrow). */
function buildStrawTufts(P, B, chest) {
  const straw = '#d8b55a';
  const tuft = (parent, x, y, z, dir = -1, n = 5, len = 0.2) => { for (let i = 0; i < n; i++) { const c = cone(0.025, len, i % 2 ? straw : '#c49a40', 4); const a = i / n * Math.PI * 2; c.position.set(x + Math.cos(a) * 0.04, y, z + Math.sin(a) * 0.04); c.rotation.set(dir < 0 ? Math.PI + Math.sin(a) * 0.5 : Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5); parent.add(c); } };
  for (const a of P.arms) tuft(a.elbow, 0, -B.armLen * 0.5, 0, -1, 5, 0.22);
  for (const l of P.legs) tuft(l.knee, 0, -B.legLen * 0.38, 0, -1, 6, 0.18);
  tuft(chest, 0, B.torsoH * 0.98, 0.06, 1, 7, 0.18);
}

function animBiped(st) {
  const P = st.parts, t = st.t, an = st.anim, S = st.root;
  if (an === 'dead') { S.rotation.x = -Math.PI / 2; S.position.y = P.bodyY * 0.28 * st.spec.size; for (const l of P.legs) { l.pivot.rotation.x = 0.25; l.knee.rotation.x = 0.3; } for (const a of P.arms) { a.shoulder.rotation.z = a.side * 1.1; a.elbow.rotation.x = 0; } P.jaw.rotation.x = 0.3; return; }
  S.rotation.x = 0; S.position.y = 0;
  const moving = an === 'walk' || an === 'run'; const speed = an === 'run' ? 11 : 6; const amp = an === 'run' ? 0.75 : moving ? 0.45 : 0;
  for (const l of P.legs) { const ph = l.side < 0 ? 0 : Math.PI; const sw = Math.sin(t * speed + ph) * amp; l.pivot.rotation.x = (l.base || 0) + sw; l.knee.rotation.x = (l.kbase || 0) + Math.max(0, -sw) * 1.1 + (moving ? 0.12 : 0.05); }
  const atk = an === 'attack' ? (k => k < 0.3 ? k / 0.3 : Math.max(0, 1 - (k - 0.3) / 0.55))((t % 1.1) / 1.1) : 0;
  for (const a of P.arms) { const ph = a.side < 0 ? Math.PI : 0; a.shoulder.rotation.x = (a.base || 0) + (moving ? Math.sin(t * speed + ph) * amp * 0.7 : Math.sin(t * 1.2 + ph) * 0.05); a.shoulder.rotation.z = a.side * (0.12 + (moving ? 0.05 : 0.03) * Math.sin(t * 1.4)); a.elbow.rotation.x = -0.2 - (moving ? 0.2 : 0.05); }
  if (atk > 0) { const a = P.arms[1]; a.shoulder.rotation.x = (a.base || 0) - 2.4 * atk + 0.9 * atk * atk; a.shoulder.rotation.z = 0; a.elbow.rotation.x = -1.2 * atk; }
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

// ------------------------------------------------------------------ roller (a wheeled machine, faces +z)
// Three wheels — one castor at the front, a driven pair at the back — a boxy chassis, and a turret
// on top that turns on its own and carries the barrel. It is the one body plan here that is built
// rather than born, so it has no jaw, no legs and no tail: `P.jaw` is the barrel (it recoils where a
// mouth would open) and `P.head` is the turret, which keeps the shared animation names honest.
function buildRoller(root, T, s) {
  const B = T.body, C = s.colors, F = s.features; const P = { legs: [], wheels: [], tailSegs: [] };
  const [cw, ch, cl] = B.chassis;
  const bodyY = B.wheelR;                       // the axles: everything hangs off this height
  P.bodyY = bodyY;
  const hip = new THREE.Group(); hip.position.y = bodyY; root.add(hip); P.hip = hip;

  // chassis: a plated deck with a sloped nose, so it reads as a vehicle and not a crate
  const deck = box(cw, ch, cl, C.body); deck.position.y = ch * 0.25; hip.add(deck);
  const nose = cone(cw * 0.5, cl * 0.34, shade(C.body, -0.1), 4); nose.rotation.x = Math.PI / 2; nose.rotation.z = Math.PI / 4; nose.position.set(0, ch * 0.2, cl * 0.56); hip.add(nose);
  const skirt = box(cw * 1.04, ch * 0.34, cl * 0.8, shade(C.body, -0.22)); skirt.position.y = -ch * 0.3; hip.add(skirt);
  if (F.plates) for (const x of [-1, 1]) { const plate = box(ch * 0.22, ch * 0.9, cl * 0.62, C.accent); plate.position.set(x * cw * 0.52, ch * 0.3, -cl * 0.05); hip.add(plate); }
  if (F.spikes) for (const x of [-1, 1]) { const stud = cone(ch * 0.16, ch * 0.5, C.accent, 5); stud.rotation.z = x * Math.PI / 2; stud.position.set(x * cw * 0.6, ch * 0.3, cl * 0.24); hip.add(stud); }

  // wheels: a pivot each, so spinning them is one rotation and nothing has to be un-rotated first
  const wheelGeomColour = shade(C.accent, -0.55);
  const place = [[0, cl * 0.42, B.wheelR * 0.78], [-cw * 0.56, -cl * 0.34, B.wheelR], [cw * 0.56, -cl * 0.34, B.wheelR]];
  for (const [x, z, r] of place) {
    const pivot = new THREE.Group(); pivot.position.set(x, r - bodyY, z); hip.add(pivot);
    const tyre = cyl(r, r, B.wheelW, wheelGeomColour, 14); tyre.rotation.z = Math.PI / 2; pivot.add(tyre);
    const hub = cyl(r * 0.42, r * 0.42, B.wheelW * 1.25, C.accent, 10); hub.rotation.z = Math.PI / 2; pivot.add(hub);
    for (let i = 0; i < 4; i++) { const spoke = box(r * 0.12, r * 1.5, B.wheelW * 0.5, shade(C.accent, -0.2)); spoke.rotation.x = (i / 4) * Math.PI; pivot.add(spoke); }
    P.wheels.push({ pivot, r, front: z > 0 });
  }

  // the turret: its own group so it can look somewhere the chassis is not pointing
  const turret = new THREE.Group(); turret.position.y = ch * 0.75 + B.turretH * 0.4; hip.add(turret); P.head = turret; P.neck = turret;
  const drum = cyl(B.turretR, B.turretR * 1.1, B.turretH, shade(C.body, 0.08), 12); turret.add(drum);
  const cap = sphere(B.turretR * 0.9, C.body, 12); cap.scale.y = 0.5; cap.position.y = B.turretH * 0.5; turret.add(cap);
  if (F.core) { const core = glowSphere(B.turretR * 0.34, C.eyes, 1.0, 10); core.position.set(0, B.turretH * 0.62, 0); turret.add(core); P.core = core; }
  // the eye it aims with, and the little mast behind it
  const eye = glowSphere(B.turretR * 0.2, C.eyes, 1.2, 10); eye.position.set(0, B.turretH * 0.12, B.turretR * 0.9); turret.add(eye); P.eye = eye;
  const mast = cyl(B.turretR * 0.07, B.turretR * 0.07, B.mastH, C.accent, 6); mast.position.set(-B.turretR * 0.5, B.turretH * 0.5 + B.mastH * 0.5, -B.turretR * 0.4); turret.add(mast);
  const lamp = glowSphere(B.turretR * 0.11, C.belly, 0.8, 8); lamp.position.set(-B.turretR * 0.5, B.turretH * 0.5 + B.mastH, -B.turretR * 0.4); turret.add(lamp);

  // the barrel — `jaw`, because that is the part the shared animations move when it attacks
  const barrel = new THREE.Group(); barrel.position.set(0, B.turretH * 0.05, B.turretR * 0.5); turret.add(barrel); P.jaw = barrel; P.barrelZ = B.turretR * 0.5; P.recoil = B.barrelLen * 0.18;
  const tube = cyl(B.barrelR, B.barrelR * 1.15, B.barrelLen, shade(C.body, -0.18), 10); tube.rotation.x = Math.PI / 2; tube.position.z = B.barrelLen * 0.5; barrel.add(tube);
  const collar = cyl(B.barrelR * 1.7, B.barrelR * 1.7, B.barrelLen * 0.16, C.accent, 10); collar.rotation.x = Math.PI / 2; collar.position.z = B.barrelLen * 0.22; barrel.add(collar);
  const muzzle = glowMesh(new THREE.TorusGeometry(B.barrelR * 1.3, B.barrelR * 0.3, 5, 10), C.eyes, 0.2); muzzle.position.z = B.barrelLen; barrel.add(muzzle); P.muzzle = muzzle;

  P.type = s.type; return P;
}
function animRoller(st, dt) {
  const P = st.parts, t = st.t, an = st.anim, S = st.root; const size = st.spec.size;
  if (an === 'dead') {
    // thrown on its side with the wheels stopped and the light out — a machine does not sag, it tips
    S.rotation.z = Math.PI / 2.2; S.position.y = -P.bodyY * 0.35 * size;
    P.jaw.rotation.x = 0.5; P.head.rotation.y = 0.7;
    if (P.core) P.core.material.emissiveIntensity = 0.05;
    if (P.muzzle) P.muzzle.material.emissiveIntensity = 0;
    P.eye.material.emissiveIntensity = 0.05;
    return;
  }
  S.rotation.z = 0; S.position.y = 0;
  const moving = an === 'walk' || an === 'run' || an === 'fly';
  const roll = an === 'run' ? 11 : moving ? 5 : 0;
  for (const w of P.wheels) w.pivot.rotation.x += roll * dt * (0.2 / w.r);
  // the chassis leans back under power and rocks over the ground it is crossing
  P.hip.rotation.x = (moving ? -0.06 : 0) - (an === 'run' ? 0.05 : 0);
  P.hip.rotation.z = moving ? Math.sin(t * roll * 0.5) * 0.02 : 0;
  P.hip.position.y = P.bodyY + (moving ? Math.abs(Math.sin(t * roll * 0.5)) * 0.01 : 0);
  // one shot every 1.1s while attacking: a quick recoil and a flash, then it slides back out
  const atk = an === 'attack' ? (k => k < 0.12 ? k / 0.12 : Math.max(0, 1 - (k - 0.12) / 0.5))((t % 1.1) / 1.1) : 0;
  P.jaw.position.z = P.barrelZ - atk * P.recoil;
  P.jaw.rotation.x = -0.05 - atk * 0.12;
  if (P.muzzle) P.muzzle.material.emissiveIntensity = atk * 3.2;
  // idle: it sweeps the horizon. Talking: it nods at you. Fighting or driving: eyes front.
  P.head.rotation.y = an === 'idle' ? Math.sin(t * 0.5) * 0.7 : an === 'talk' ? Math.sin(t * 3) * 0.1 : Math.sin(t * 0.9) * 0.06;
  P.head.rotation.x = an === 'talk' ? 0.12 + Math.sin(t * 8) * 0.1 : 0;
  P.eye.material.emissiveIntensity = 1.2 + Math.sin(t * 3) * 0.3 + atk * 1.5;
  if (P.core) P.core.material.emissiveIntensity = 0.9 + Math.sin(t * 2.4) * 0.3 + atk;
}

// ------------------------------------------------------------------ fowl (a ground bird on two legs, faces +z)
// The hen (2026-10-03, Bannerline's Hunters vs Farmers). A round body on two thin legs, folded wings
// that flap when it runs, a fan of tail feathers, a head on a short neck with a beak, a comb and a
// wattle (`features.comb`). Anims: idle (head bob, a look round), walk (the head jerks with each step),
// run / panic (wings out and flapping), graze (pecking at the ground), talk (beak clucks), attack
// (a peck lunge), dead (on its side, feet up).
function buildFowl(root, T, s) {
  const B = T.body, C = s.colors, F = s.features; const P = { legs: [], wings: [] };
  P.bodyY = B.legLen + B.r * 0.75;
  const hip = new THREE.Group(); hip.position.y = P.bodyY; root.add(hip); P.hip = hip;
  const body = sphere(B.r, C.body, 14); body.scale.set(0.95, 0.9, 1.2); hip.add(body);
  const breast = sphere(B.r * 0.75, C.belly, 12); breast.position.set(0, -B.r * 0.15, B.r * 0.45); hip.add(breast);
  // tail fan
  const tail = new THREE.Group(); tail.position.set(0, B.r * 0.35, -B.r * 0.95); tail.rotation.x = -0.6; hip.add(tail); P.tail = tail;
  for (let i = -2; i <= 2; i++) { const f = sphere(B.r * 0.5, i % 2 ? C.accent : C.body, 8); f.scale.set(0.35, 1.0, 0.18); f.position.set(i * B.r * 0.16, B.r * 0.35, -B.r * 0.1); f.rotation.z = i * 0.22; tail.add(f); }
  // wings: folded ellipsoids that pivot at the shoulder
  for (const x of [-1, 1]) { const w = new THREE.Group(); w.position.set(x * B.r * 0.82, B.r * 0.2, B.r * 0.15); hip.add(w); const m = sphere(B.r * 0.62, shade(C.body, -0.08), 10); m.scale.set(0.3, 0.75, 1.15); m.position.set(0, -B.r * 0.15, -B.r * 0.25); w.add(m); P.wings.push({ group: w, side: x }); }
  // neck + head
  const neck = new THREE.Group(); neck.position.set(0, B.r * 0.55, B.r * 0.75); hip.add(neck); P.neck = neck;
  const nk = capsule(B.r * 0.32, B.neck, C.body); nk.position.y = B.neck * 0.5; neck.add(nk);
  const head = new THREE.Group(); head.position.set(0, B.neck + B.headR * 0.6, B.headR * 0.15); neck.add(head); P.head = head;
  head.add(sphere(B.headR, C.body, 12));
  const beak = cone(B.headR * 0.35, B.headR * 0.9, C.nose || '#e8a030', 6); beak.rotation.x = Math.PI / 2; beak.position.set(0, -B.headR * 0.05, B.headR * 1.25); head.add(beak);
  const jaw = new THREE.Group(); jaw.position.set(0, -B.headR * 0.22, B.headR * 0.8); head.add(jaw); P.jaw = jaw;
  const lower = cone(B.headR * 0.22, B.headR * 0.6, shade(C.nose || '#e8a030', -0.15), 5); lower.rotation.x = Math.PI / 2; lower.position.z = B.headR * 0.3; jaw.add(lower);
  for (const x of [-1, 1]) { const e = sphere(B.headR * 0.18, '#1a1410', 8); e.position.set(x * B.headR * 0.62, B.headR * 0.2, B.headR * 0.55); head.add(e); }
  if (F.comb) { for (let i = 0; i < 4; i++) { const c = sphere(B.headR * (0.3 - i * 0.03), C.accent, 8); c.scale.set(0.5, 1, 1); c.position.set(0, B.headR * (0.95 + (i % 2) * 0.12), B.headR * (0.45 - i * 0.32)); head.add(c); } const wat = sphere(B.headR * 0.25, C.accent, 8); wat.scale.set(0.6, 1.2, 0.6); wat.position.set(0, -B.headR * 0.7, B.headR * 0.8); head.add(wat); }
  // legs
  for (const x of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(x * B.r * 0.38, -B.r * 0.6, B.r * 0.05); hip.add(pivot);
    const thigh = sphere(B.r * 0.3, C.body, 8); thigh.scale.set(0.8, 1, 0.9); pivot.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -B.r * 0.15; pivot.add(knee);
    const shin = cyl(B.legR, B.legR, B.legLen, C.nose || '#e8a030', 5); shin.position.y = -B.legLen * 0.5; knee.add(shin);
    for (const a of [-0.5, 0, 0.5]) { const toe = cyl(B.legR * 0.8, B.legR * 0.6, B.legLen * 0.45, C.nose || '#e8a030', 4); toe.rotation.x = Math.PI / 2; toe.rotation.y = a; toe.position.set(Math.sin(a) * B.legLen * 0.2, -B.legLen, Math.cos(a) * B.legLen * 0.2); knee.add(toe); }
    P.legs.push({ pivot, knee, side: x });
  }
  P.type = s.type; return P;
}
function animFowl(st) {
  const P = st.parts, t = st.t, an = st.anim, S = st.root;
  if (an === 'dead') { S.rotation.z = Math.PI / 2; S.position.y = P.bodyY * 0.4 * st.spec.size; for (const l of P.legs) l.pivot.rotation.x = -0.6; for (const w of P.wings) w.group.rotation.z = w.side * 0.9; P.neck.rotation.x = 0.8; return; }
  S.rotation.z = 0; S.position.y = 0;
  const run = an === 'run' || an === 'panic', moving = an === 'walk' || run, speed = run ? 18 : 9, amp = run ? 0.75 : moving ? 0.45 : 0;
  for (const l of P.legs) { const sw = Math.sin(t * speed + (l.side < 0 ? 0 : Math.PI)) * amp; l.pivot.rotation.x = sw; l.knee.rotation.x = Math.max(0, -sw) * 0.8; }
  P.hip.position.y = P.bodyY + (moving ? Math.abs(Math.sin(t * speed)) * 0.03 : Math.sin(t * 2) * 0.005) * st.spec.size;
  P.hip.rotation.x = run ? 0.25 : an === 'graze' ? 0.35 * Math.max(0, Math.sin(t * 3)) : 0;
  // the head: jerks with each step, pecks when grazing, clucks when talking
  const peck = an === 'graze' ? Math.max(0, Math.sin(t * 3.2)) : an === 'attack' ? Math.max(0, Math.sin(t * 8)) : 0;
  P.neck.position.z = moving ? Math.abs(Math.sin(t * speed)) * 0.04 : 0;
  P.neck.rotation.x = peck * 1.2 + (an === 'talk' ? -0.2 : 0) + (run ? 0.3 : 0);
  P.neck.rotation.y = an === 'idle' ? (Math.sin(t * 0.9) > 0.6 ? 0.6 : Math.sin(t * 0.9) < -0.6 ? -0.6 : 0) : an === 'panic' ? Math.sin(t * 11) * 0.5 : 0;
  P.jaw.rotation.x = an === 'talk' || an === 'panic' ? 0.15 + Math.abs(Math.sin(t * 14)) * 0.25 : peck * 0.2;
  const flap = run ? Math.sin(t * (an === 'panic' ? 26 : 18)) : an === 'talk' ? Math.sin(t * 10) * 0.3 : 0;
  for (const w of P.wings) w.group.rotation.z = w.side * (run ? 0.7 + flap * 0.6 : Math.abs(flap) * 0.4);
  P.tail.rotation.x = -0.6 + (moving ? Math.sin(t * speed) * 0.08 : 0);
}
