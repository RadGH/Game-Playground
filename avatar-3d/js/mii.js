// Procedural Mii-style character from Three.js primitives, driven by the same avatar JSON as Avatar 2D.
// Layout (metres, neutral body): feet y=0 · hip 0.75 · neck 1.32 · head centre 1.57, head radius 0.25 (chibi).
// Groups: legs (scaled about the feet), torso (at the hip), head (at the neck, scaled by headSize only).
// The face is the 2D face parts rasterized onto a curved patch in front of the head (Mii technique).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { normalizeAvatar, shade } from '../../avatar-2d/js/render.js';
import { faceTexture } from './face-texture.js';

export const MII = { hip: 0.75, neck: 1.32, headR: 0.25, shoulderX: 0.2, legX: 0.11 };

function mat(color, extra = {}) { return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0, ...extra }); }
function capsule(r, len, color) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat(color)); m.castShadow = true; return m; }
function sphere(r, color, seg = 24) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), mat(color)); m.castShadow = true; return m; }
function box(w, h, d, color, radius = 0) { const m = new THREE.Mesh(radius ? new RoundedBoxGeometry(w, h, d, 4, radius) : new THREE.BoxGeometry(w, h, d), mat(color)); m.castShadow = true; return m; }
function cone(r, h, color, seg = 24) { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color)); m.castShadow = true; return m; }
function cyl(rt, rb, h, color, seg = 24) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color)); m.castShadow = true; return m; }
function torus(r, t, color) { const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 10, 32), mat(color)); m.castShadow = true; return m; }
function capGeo(r, thetaLength, phiStart = 0, phiLength = Math.PI * 2) { return new THREE.SphereGeometry(r, 32, 16, phiStart, phiLength, 0, thetaLength); }

export function metrics(body) {
  const h = body.height ?? 0.5, w = body.width ?? 0.5, hs = body.headSize ?? 0.5;
  const legScale = 0.7 + h * 0.7, torsoScale = 0.85 + h * 0.3, widthScale = 0.7 + w * 0.7, headScale = 0.8 + hs * 0.4;
  const hipY = MII.hip * legScale, neckY = hipY + (MII.neck - MII.hip) * torsoScale;
  return { legScale, torsoScale, widthScale, headScale, hipY, neckY, totalHeight: neckY + (MII.headR * 2 + 0.02) * headScale };
}

const HEAD_SHAPES = { round: [1, 1, 1], oval: [0.92, 1.07, 0.95], square: 'box', heart: [1.02, 1, 0.94], long: [0.9, 1.14, 0.92], wide: [1.14, 0.94, 1.02], chiseled: 'box2' };

/** Build the whole character. Returns { group, update(dt,t), setAnim(name), setAvatar(avatar) (async), dispose() } */
export async function createMiiCharacter(avatar) {
  const group = new THREE.Group(); group.userData.character = true;
  const state = { anim: 'idle', parts: {}, avatar: null, t: 0 };
  async function build(av) {
    const a = normalizeAvatar(av); state.avatar = a;
    while (group.children.length) { disposeObj(group.children[0]); group.remove(group.children[0]); }
    const m = metrics(a.body); const skin = a.body.skin, skinD = shade(skin, -0.15);
    const P = state.parts = {};
    // ---- legs
    const legs = new THREE.Group(); legs.scale.set(m.widthScale, m.legScale, m.widthScale); group.add(legs); P.legs = legs;
    const legLen = MII.hip;
    const bottomId = a.bottom.id, shortsLike = ['shorts', 'skirt', 'kilt', 'loincloth'].includes(bottomId);
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(side * MII.legX, legLen, 0); legs.add(pivot); P['leg' + (side < 0 ? 'L' : 'R')] = pivot;
      const upperColor = ['skirt', 'kilt', 'loincloth'].includes(bottomId) ? skin : a.bottom.color;
      const upper = capsule(0.085, legLen * 0.45, upperColor); upper.position.y = -legLen * 0.27; pivot.add(upper);
      const lower = capsule(0.075, legLen * 0.45, shortsLike ? skin : a.bottom.color); lower.position.y = -legLen * 0.72; pivot.add(lower);
      if (bottomId === 'greaves') { const knee = sphere(0.09, shade(a.bottom.color, -0.2)); knee.position.y = -legLen * 0.5; pivot.add(knee); }
      if (bottomId === 'ragged') lower.scale.set(1, 0.85, 1);
      // shoes
      const sh = a.shoes.id, sc = a.shoes.color;
      let foot;
      if (sh === 'barefoot') foot = box(0.13, 0.07, 0.2, skin, 0.03);
      else if (sh === 'boots') foot = box(0.14, 0.2, 0.22, sc, 0.03);
      else if (sh === 'heavy') foot = box(0.17, 0.24, 0.26, sc, 0.03);
      else if (sh === 'sandals') foot = box(0.13, 0.04, 0.2, sc, 0.01);
      else if (sh === 'pointed') foot = box(0.12, 0.08, 0.3, sc, 0.03);
      else if (sh === 'hooves') foot = box(0.12, 0.1, 0.14, shade(sc, -0.3), 0.02);
      else foot = box(0.14, 0.08, 0.22, sc, 0.03);
      foot.geometry.computeBoundingBox(); const fh = foot.geometry.boundingBox.max.y - foot.geometry.boundingBox.min.y;
      foot.position.set(0, -legLen + fh / 2, 0.03); if (sh === 'pointed') foot.position.z = 0.07; pivot.add(foot);
    }
    // skirts (in legs group so they follow leg length)
    if (['skirt', 'kilt'].includes(bottomId)) { const s = cyl(0.17, 0.3, 0.3, a.bottom.color, 24); s.position.y = legLen - 0.16; legs.add(s); }
    if (bottomId === 'loincloth') { const s = box(0.18, 0.28, 0.02, a.bottom.color); s.position.set(0, legLen - 0.15, 0.1); legs.add(s); }
    if (['robe', 'dress', 'coat'].includes(a.top.id)) { const len = a.top.id === 'robe' ? 0.7 : a.top.id === 'dress' ? 0.55 : 0.5; const s = cyl(0.2, 0.34, len, a.top.color, 24); s.position.y = legLen - len / 2 + 0.02; legs.add(s); if (a.top.id === 'coat') { const split = box(0.02, len, 0.02, shade(a.top.color, -0.2)); split.position.set(0, legLen - len / 2 + 0.02, 0.33); s.add(split); } }
    // ---- torso
    const torso = new THREE.Group(); torso.position.y = m.hipY; torso.scale.set(m.widthScale, m.torsoScale, m.widthScale); group.add(torso); P.torso = torso;
    const tl = MII.neck - MII.hip; const topId = a.top.id, tc = a.top.color, tc2 = a.top.color2 || '#fff';
    const body = box(0.42, tl, 0.28, tc, 0.09); body.position.y = tl / 2; torso.add(body); P.body = body;
    if (topId === 'tank') { body.material.color.set(tc); }
    if (topId === 'plate') { for (const s of [-1, 1]) { const pauldron = sphere(0.11, tc2); pauldron.scale.set(1, 0.7, 1); pauldron.position.set(s * 0.22, tl - 0.05, 0); torso.add(pauldron); } const plate = box(0.3, 0.3, 0.06, shade(tc, -0.15), 0.03); plate.position.set(0, tl * 0.55, 0.14); torso.add(plate); }
    if (topId === 'vest' || topId === 'apron') { const panel = box(0.24, tl * 0.9, 0.02, topId === 'vest' ? tc : tc, 0.02); panel.position.set(0, tl / 2, 0.15); torso.add(panel); body.material.color.set(tc2); }
    if (topId === 'hoodie') { const hood = torus(0.13, 0.05, shade(tc, -0.15)); hood.rotation.x = Math.PI / 2; hood.position.set(0, tl + 0.02, -0.04); torso.add(hood); }
    if (topId === 'leather' || topId === 'tunic' || topId === 'chainmail') { const belt = box(0.44, 0.06, 0.3, shade(topId === 'chainmail' ? tc2 : tc, -0.35), 0.02); belt.position.y = 0.06; torso.add(belt); }
    if (topId === 'rags') { body.material.color.set(shade(tc, -0.1)); }
    // neck
    const neck = cyl(0.07, 0.08, 0.12, skinD); neck.position.y = tl; torso.add(neck);
    // arms
    const longSleeve = ['tunic', 'hoodie', 'vest', 'plate', 'robe', 'coat', 'chainmail'].includes(topId), noSleeve = ['tank', 'apron'].includes(topId) ;
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(side * (0.21 + 0.04), tl - 0.06, 0); torso.add(pivot); P['arm' + (side < 0 ? 'L' : 'R')] = pivot;
      const upper = capsule(0.065, 0.2, noSleeve ? skin : tc); upper.position.y = -0.14; pivot.add(upper);
      const lower = capsule(0.06, 0.2, longSleeve ? tc : skin); lower.position.y = -0.36; pivot.add(lower);
      const hand = sphere(0.07, skin); hand.position.y = -0.5; pivot.add(hand);
      if (topId === 'robe') { const cuff = cyl(0.09, 0.12, 0.14, tc); cuff.position.y = -0.42; pivot.add(cuff); }
      pivot.rotation.z = side * 0.12;
    }
    // ---- head
    const head = new THREE.Group(); head.position.y = m.neckY; head.scale.setScalar(m.headScale); group.add(head); P.head = head;
    const R = MII.headR; const hs = HEAD_SHAPES[a.headShape] || HEAD_SHAPES.round;
    let skull;
    if (hs === 'box') { skull = box(R * 1.9, R * 2, R * 1.85, skin, R * 0.55); }
    else if (hs === 'box2') { skull = box(R * 1.85, R * 2.05, R * 1.8, skin, R * 0.4); }
    else { skull = sphere(R, skin, 40); skull.scale.set(...hs); }
    skull.position.y = R + 0.01; head.add(skull); P.skull = skull;
    // face patch: curved segment slightly outside the skull, same non-uniform scale
    const patch = new THREE.Mesh(capGeo(R * 1.015, 0, 0), new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }));
    patch.geometry.dispose(); const A = 1.0, B = 0.95;
    patch.geometry = new THREE.SphereGeometry(R * 1.012, 32, 24, Math.PI / 2 - A, 2 * A, Math.PI / 2 - B, 2 * B);
    patch.position.copy(skull.position); patch.scale.copy(skull.scale); if (hs === 'box' || hs === 'box2') patch.scale.set(0.98, 1.02, 0.95); head.add(patch); P.patch = patch;
    try { patch.material.map = await faceTexture(a, { size: 512 }); patch.material.needsUpdate = true; } catch (e) { console.warn('face texture failed', e); }
    // ears
    const earY = R + 0.01, earX = R * (hs === 'box' || hs === 'box2' ? 0.95 : (Array.isArray(hs) ? hs[0] : 1));
    if (a.ears.id === 'normal' || a.ears.id === 'big') { const er = a.ears.id === 'big' ? 0.075 : 0.05; for (const s of [-1, 1]) { const e = sphere(er, skin); e.scale.set(0.5, 1, 0.8); e.position.set(s * earX, earY, 0); head.add(e); } }
    if (a.ears.id === 'pointed') for (const s of [-1, 1]) { const e = cone(0.045, 0.22, skin, 12); e.rotation.z = s * -Math.PI / 2 + s * 0.35; e.position.set(s * (earX + 0.07), earY + 0.03, 0); head.add(e); }
    if (a.ears.id === 'fins') for (const s of [-1, 1]) { const e = box(0.14, 0.16, 0.02, skin); e.rotation.y = s * 0.3; e.position.set(s * (earX + 0.05), earY, 0); head.add(e); }
    // hair
    const fit = (hs === 'box' || hs === 'box2') ? new THREE.Vector3(1.17, 1.03, 1.1) : skull.scale.clone();
    buildHair(head, a, R, fit);
    buildBeard(head, a, R, fit);
    buildHat(head, a, R, fit);
    return group;
  }
  function disposeObj(o) { o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } }); }
  await build(avatar);
  const ctrl = {
    group, metrics: () => metrics(state.avatar.body),
    async setAvatar(av) { await build(av); },
    setAnim(name) { state.anim = name; },
    get anim() { return state.anim; },
    update(dt, t) {
      const P = state.parts; if (!P.legs) return; state.t += dt; const tt = state.t;
      const an = state.anim; const s = an === 'run' ? 11 : 6, amp = an === 'run' ? 0.9 : an === 'walk' ? 0.55 : 0;
      const swing = Math.sin(tt * s) * amp;
      P.legL.rotation.x = swing; P.legR.rotation.x = -swing;
      P.armL.rotation.x = -swing * 0.8; P.armR.rotation.x = swing * 0.8;
      const bob = amp ? Math.abs(Math.sin(tt * s)) * 0.03 * (an === 'run' ? 1.6 : 1) : Math.sin(tt * 1.6) * 0.006;
      group.position.y = bob;
      if (an === 'idle') { P.armL.rotation.z = -0.12 + Math.sin(tt * 1.6) * 0.03; P.armR.rotation.z = 0.12 - Math.sin(tt * 1.6) * 0.03; P.head.rotation.set(0, Math.sin(tt * 0.5) * 0.08, 0); }
      else if (an === 'wave') { P.armR.rotation.z = 2.6 + Math.sin(tt * 8) * 0.35; P.armR.rotation.x = 0; P.armL.rotation.z = -0.12; P.head.rotation.set(0, 0, Math.sin(tt * 2) * 0.05); }
      else if (an === 'talk') { P.head.rotation.set(Math.sin(tt * 7) * 0.04, Math.sin(tt * 1.3) * 0.15, 0); P.armL.rotation.set(Math.sin(tt * 3) * 0.3 - 0.2, 0, -0.35); P.armR.rotation.set(Math.cos(tt * 2.5) * 0.3 - 0.2, 0, 0.35); }
      else if (an === 'dead') { group.rotation.x = -Math.PI / 2; group.position.y = 0.3; return; }
      else { P.head.rotation.set(0, 0, Math.sin(tt * s) * 0.03); P.armL.rotation.z = -0.12; P.armR.rotation.z = 0.12; }
      group.rotation.x = 0;
    },
    dispose() { disposeObj(group); },
  };
  return ctrl;
}

function buildHair(head, a, R, skullScale) {
  const id = a.hair.id, hc = a.hair.color, hd = shade(hc, -0.2);
  if (id === 'bald') return;
  const y = R + 0.01; const r = R * 1.07;
  const capOf = (thetaLength, phiStart, phiLength) => { const c = new THREE.Mesh(capGeo(r, thetaLength, phiStart, phiLength), mat(hc)); c.castShadow = true; c.position.y = y; c.scale.copy(skullScale); head.add(c); return c; };
  const add = (mesh, x, yy, z) => { mesh.position.set(x, y + yy, z); head.add(mesh); return mesh; };
  const cap = { buzz: 0.95, short: 1.15, side_part: 1.2, bangs: 1.35, bob: 1.5, long: 1.4, wavy: 1.45, ponytail: 1.15, bun: 1.15, buns: 1.15, mohawk: 0, spiky: 1.05, curly: 1.2, afro: 0, braids: 1.2, pixie: 1.25, slicked: 1.1, hood_hair: 1.5, tonsure: 0, horns_hair: 1.2 }[id] ?? 1.15;
  if (cap) capOf(cap, 0, Math.PI * 2);
  if (id === 'tonsure') { const ring = capOf(1.55, 0, Math.PI * 2); const hole = new THREE.Mesh(capGeo(r * 1.01, 0.75), mat(a.body.skin)); hole.position.y = y; head.add(hole); }
  if (id === 'bangs' || id === 'bob' || id === 'long' || id === 'wavy' || id === 'hood_hair') { /* fringe: cap already reaches the brow */ }
  // hanging hair is a HALF cylinder open at the front (theta from +x round the back to -x), so it never wraps the face
  const backHair = (rt, rb, h, yy, seg = 32) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, false, Math.PI / 2, Math.PI), mat(hc, { side: THREE.DoubleSide })); m.castShadow = true; m.position.set(0, y + yy, -0.02); m.scale.set(skullScale.x, 1, skullScale.z * 0.95); head.add(m); return m; };
  if (id === 'bob') backHair(r * 0.98, r * 1.02, R * 1.1, -R * 0.25);
  if (id === 'long' || id === 'wavy') { backHair(r * 0.96, r * 1.0, R * 2.2, -R * 0.8); if (id === 'wavy') { for (const s of [-1, 1]) { const w = capsule(0.06, R * 1.3, hd); w.position.set(s * r * 0.9, y - R * 1.0, -0.02); head.add(w); } } }
  if (id === 'hood_hair') backHair(r, r * 1.1, R * 1.3, -R * 0.4, 12);
  if (id === 'ponytail') { const tail = capsule(0.07, R * 1.6, hc); tail.rotation.x = 0.35; add(tail, 0, -R * 0.4, -r * 0.95); const band = torus(0.075, 0.02, hd); band.rotation.x = Math.PI / 2 + 0.35; add(band, 0, R * 0.3, -r * 0.85); }
  if (id === 'bun') add(sphere(R * 0.42, hc), 0, R * 1.05, -R * 0.15);
  if (id === 'buns') for (const s of [-1, 1]) add(sphere(R * 0.36, hc), s * R * 0.85, R * 0.8, -R * 0.1);
  if (id === 'mohawk') { const strip = box(R * 0.3, R * 0.9, R * 1.5, hc, 0.02); add(strip, 0, R * 1.05, -R * 0.15); }
  if (id === 'spiky') for (let i = 0; i < 7; i++) { const c = cone(R * 0.16, R * 0.6, hc, 8); const ang = (i / 7) * Math.PI * 2; c.position.set(Math.sin(ang) * R * 0.55, y + R * 0.85, Math.cos(ang) * R * 0.55 - R * 0.1); c.lookAt(new THREE.Vector3(c.position.x * 3, c.position.y + R * 2, c.position.z * 3)); c.rotateX(Math.PI / 2); head.add(c); }
  if (id === 'curly') for (let i = 0; i < 12; i++) { const ang = (i / 12) * Math.PI * 2; add(sphere(R * 0.3, i % 2 ? hc : hd), Math.sin(ang) * r * 0.85, R * 0.55 + Math.cos(ang * 2) * 0.03, Math.cos(ang) * r * 0.85 - 0.03); }
  if (id === 'afro') { const big = sphere(R * 1.5, hc, 32); big.position.set(0, y + R * 0.25, -R * 0.15); big.scale.set(1, 0.95, 0.95); head.add(big); const face = new THREE.Mesh(capGeo(R * 1.02, 0.95, Math.PI / 2 - 1.05, 2.1), mat(a.body.skin)); face.position.y = y; head.add(face); }
  if (id === 'braids') for (const s of [-1, 1]) { const b = capsule(0.05, R * 1.6, hc); b.position.set(s * r * 0.95, y - R * 0.9, 0.04); head.add(b); const tip = sphere(0.055, hd); tip.position.set(s * r * 0.95, y - R * 1.75, 0.04); head.add(tip); }
  if (id === 'horns_hair') for (const s of [-1, 1]) { const h = cone(R * 0.18, R * 0.9, '#d9cfa8', 10); h.position.set(s * R * 0.7, y + R * 1.05, -R * 0.1); h.rotation.z = s * -0.5; head.add(h); }
  if (id === 'side_part') { const part = box(R * 1.2, 0.01, R * 0.8, hd); part.position.set(R * 0.25, y + R * 1.05, R * 0.2); part.rotation.z = -0.15; head.add(part); }
}

function buildBeard(head, a, R, fit) {
  const id = a.facialHair.id; if (!['full', 'long', 'chinstrap'].includes(id)) return; // stubble/goatee/mustache stay on the face texture
  const hc = a.hair.color, y = R + 0.01;
  // lower-front band hugging the jaw (phi around the front, theta below the mouth)
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(R * 1.05, 32, 16, Math.PI / 2 - 1.15, 2.3, Math.PI / 2 + 0.25, 0.95), mat(hc, { side: THREE.DoubleSide })); jaw.position.y = y; jaw.scale.copy(fit); head.add(jaw);
  if (id === 'long') { const tail = cone(R * 0.42, R * 1.5, hc, 16); tail.rotation.x = Math.PI + 0.25; tail.position.set(0, y - R * 1.35, R * 0.45); head.add(tail); }
  if (id === 'full') { const chin = sphere(R * 0.38, hc, 16); chin.scale.set(1.2, 0.8, 1); chin.position.set(0, y - R * 0.85, R * 0.55); head.add(chin); }
}
function buildHat(head, a, R, fit = new THREE.Vector3(1, 1, 1)) {
  const id = a.hat.id, hc = a.hat.color; if (id === 'none') return;
  const y = R + 0.01, top = y + R * 0.98;
  const add = (m, x, yy, z) => { m.position.set(x, yy, z); head.add(m); return m; };
  if (id === 'wizard') { add(cone(R * 0.95, R * 2.6, hc, 24), 0, top + R * 1.1, -0.02).rotation.z = 0.12; add(cyl(R * 1.7, R * 1.75, 0.03, hc, 32), 0, top - 0.05, -0.02); add(torus(R * 1.0, 0.025, shade(hc, 0.3)), 0, top - 0.02, -0.02).rotation.x = Math.PI / 2; }
  if (id === 'helmet' || id === 'horned_helm') { const h = new THREE.Mesh(capGeo(R * 1.12, 1.75), mat(hc, { metalness: 0.5, roughness: 0.4 })); h.position.y = y; h.scale.copy(fit); head.add(h); const guard = box(0.05, 0.2, 0.03, hc); guard.position.set(0, y - 0.02, R * 1.05); head.add(guard); if (id === 'horned_helm') for (const s of [-1, 1]) { const horn = cone(R * 0.2, R * 1.1, '#d9cfa8', 10); horn.position.set(s * R * 1.05, y + R * 0.5, 0); horn.rotation.z = s * -0.9; head.add(horn); } }
  if (id === 'crown') { const ring = cyl(R * 0.85, R * 0.8, R * 0.5, hc, 24, true); ring.material.side = THREE.DoubleSide; ring.material.metalness = 0.7; ring.material.roughness = 0.3; add(ring, 0, top, 0); for (let i = 0; i < 6; i++) { const ang = (i / 6) * Math.PI * 2; const spike = cone(R * 0.12, R * 0.35, hc, 6); spike.material.metalness = 0.7; spike.position.set(Math.sin(ang) * R * 0.82, top + R * 0.4, Math.cos(ang) * R * 0.82); head.add(spike); } }
  if (id === 'cap') { const c = new THREE.Mesh(capGeo(R * 1.1, 1.3), mat(hc)); c.position.y = y; c.scale.copy(fit); head.add(c); const visor = box(R * 1.1, 0.02, R * 0.7, shade(hc, -0.2), 0.01); visor.position.set(0, y + R * 0.35, R * 1.05); head.add(visor); }
  if (id === 'hood') { // top cap + a lower band that leaves the face open (phi excludes ±0.85 rad around the front)
    const top = new THREE.Mesh(capGeo(R * 1.22, 0.95), mat(hc, { side: THREE.DoubleSide })); top.position.set(0, y + 0.02, -0.02); top.scale.copy(fit); head.add(top);
    const band = new THREE.Mesh(new THREE.SphereGeometry(R * 1.22, 32, 16, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, 0.9, 1.5), mat(hc, { side: THREE.DoubleSide })); band.position.copy(top.position); band.scale.copy(fit); head.add(band);
    const drape = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.05, R * 1.35, R * 0.9, 24, 1, true, Math.PI / 2 + 0.6, Math.PI * 2 - 1.2), mat(hc, { side: THREE.DoubleSide })); drape.position.set(0, y - R * 0.95, -0.03); head.add(drape); }
  if (id === 'bandana' || id === 'headband') { const band = new THREE.Mesh(capGeo(R * 1.1, id === 'bandana' ? 1.35 : 0.9, 0, Math.PI * 2), mat(hc)); band.position.y = y + (id === 'headband' ? -R * 0.05 : 0); if (id === 'headband') { band.geometry.dispose(); band.geometry = new THREE.SphereGeometry(R * 1.1, 32, 8, 0, Math.PI * 2, 0.85, 0.3); } head.add(band); const knot = box(0.12, 0.05, 0.03, hc); knot.position.set(R * 0.9, y + R * 0.3, -R * 0.5); knot.rotation.y = -0.6; head.add(knot); }
  if (id === 'straw') { add(cyl(R * 1.9, R * 1.9, 0.02, hc, 32), 0, top - 0.06, 0); add(cyl(R * 0.85, R * 0.9, R * 0.5, hc, 24), 0, top + R * 0.2, 0); }
  if (id === 'circlet') { const t = torus(R * 1.05, 0.012, hc); t.material.metalness = 0.8; t.material.roughness = 0.3; t.rotation.x = Math.PI / 2; add(t, 0, y + R * 0.55, 0); }
  if (id === 'top_hat') { add(cyl(R * 0.75, R * 0.75, R * 1.3, hc, 24), 0, top + R * 0.6, 0); add(cyl(R * 1.3, R * 1.3, 0.02, hc, 32), 0, top - 0.04, 0); const band = cyl(R * 0.77, R * 0.77, R * 0.2, shade(hc, 0.35), 24); add(band, 0, top + R * 0.1, 0); }
  if (id === 'flower') { for (let i = 0; i < 5; i++) { const ang = (i / 5) * Math.PI * 2; add(sphere(0.03, hc), R * 0.75 + Math.sin(ang) * 0.045, y + R * 0.75 + Math.cos(ang) * 0.045, R * 0.5); } add(sphere(0.02, '#ffd54a'), R * 0.75, y + R * 0.75, R * 0.53); }
}
