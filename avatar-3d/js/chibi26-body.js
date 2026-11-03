// Chibi 2.6 realistic-cartoon body proportions applied before the shared garment/body mesher runs.
// Garments still use the established named bones; their surfaces are built from the updated dimensions.
import { CHIBI26_RACES } from './chibi2-races.js';
import * as THREE from 'three';

export function applyBody26(rig, avatar) {
  const race = CHIBI26_RACES[avatar?.body?.race] || CHIBI26_RACES.human;
  const form = avatar?.body?.form === 'fem' ? 'fem' : 'masc';
  const heightDial = Number.isFinite(avatar?.body?.height) ? Math.max(0, Math.min(1, avatar.body.height)) : 0.5;
  const femShoulder = form === 'fem' ? 0.93 : 1;
  const femHip = form === 'fem' ? 1.04 : 1;
  // Head size is an independent dial: solve the legs against the neutral head scale so
  // changing it reshapes the head without changing the character's overall height.
  // race25() maps the head to 0.72..1.28 before createRig(), so compensate
  // against that exact multiplier when solving the leg length.
  const headDial = 0.72 + (Number.isFinite(avatar?.body?.headSize) ? Math.max(0, Math.min(1, avatar.body.headSize)) : 0.5) * 0.56;
  const neutralHeadScale = rig.headScale / headDial * 0.58 * race.head * race.height;

  // 2.5 head geometry spans about 0.60 m at headScale=1.0. A 0.35 m head on
  // a 1.75 m body gives the requested five-head cartoon proportion.
  rig.headScale *= 0.58 * race.head * race.height;
  rig.torso *= 0.98 * race.height;
  rig.wide *= femHip * race.hips * race.height;
  rig.shoulders *= 0.82 * femShoulder * race.shoulders;
  rig.arm *= 1.40 * race.arm;
  rig.hand *= 1.32 * race.hand;
  rig.neck = 0.4 * (race.height < 0.9 ? 0.95 : 1);
  rig.form = form;
  rig.skinColor = avatar?.body?.skin || '#f1c27d';
  rig.v26 = true;

  // Solve the leg segment for five head units while preserving each race's whole-body size.
  const headUnits = 5 * 0.60 * neutralHeadScale * (0.96 + heightDial * 0.08);
  rig.leg = Math.max(0.35, headUnits - 0.07 - 0.53 * rig.torso - 0.60 * rig.headScale - (rig.neck - 1) * 0.05);

  // Reposition the complete hierarchy from the same source dimensions used by the body mesher.
  const B = rig.byName;
  B.hips.position.y = rig.leg + 0.07;
  B.chest.position.y = 0.15 * rig.torso;
  B.head.position.y = 0.38 * rig.torso + (rig.neck - 1) * 0.05;
  B.eyeL.position.set(-0.12 * rig.headScale, 0.278 * rig.headScale, 0.255 * rig.headScale);
  B.eyeR.position.set(0.12 * rig.headScale, 0.278 * rig.headScale, 0.255 * rig.headScale);
  for (const [s, x] of [['L', -1], ['R', 1]]) {
    B['arm' + s].position.set(x * 0.255 * rig.wide * rig.shoulders, 0.24 * rig.torso, 0);
    B['elbow' + s].position.set(0, -0.21 * rig.torso * rig.arm, 0);
    B['hand' + s].position.set(0, -0.205 * rig.torso * rig.arm, 0);
    B['leg' + s].position.set(x * 0.115 * rig.wide, 0, 0);
    B['knee' + s].position.set(0, -rig.leg * 0.51, 0);
    B['foot' + s].position.set(0, -rig.leg * 0.49, 0);
  }
  rig.root.updateMatrixWorld(true);
  rig.height = rig.leg + 0.07 + 0.15 * rig.torso + 0.38 * rig.torso + (rig.neck - 1) * 0.05 + 0.60 * rig.headScale;
  return rig;
}

function clustered(source, cell) {
  const pos = source.attributes.position, col = source.attributes.color, nor = source.attributes.normal;
  const si = source.attributes.skinIndex, sw = source.attributes.skinWeight;
  const uv = source.attributes.uv, sm = source.attributes.skinMask, sc = source.attributes.surfaceClass;
  const keys = new Map(), map = new Uint32Array(pos.count), sums = [];
  for (let i = 0; i < pos.count; i++) {
    const key = [Math.round(pos.getX(i) / cell), Math.round(pos.getY(i) / cell), Math.round(pos.getZ(i) / cell),
      si.getX(i), si.getY(i), si.getZ(i), si.getW(i), sm ? sm.getX(i) : 0, sc ? sc.getX(i) : 0].join(':');
    let n = keys.get(key);
    if (n === undefined) { n = sums.length; keys.set(key, n); sums.push({ p: [0, 0, 0], c: [0, 0, 0], n: [0, 0, 0], u: [0, 0], m: 0, s: sc ? sc.getX(i) : 0, w: [0, 0, 0, 0], count: 0, bones: [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)] }); }
    const a = sums[n]; map[i] = n; a.count++;
    for (let k = 0; k < 3; k++) { a.p[k] += pos.getComponent(i, k); a.c[k] += col.getComponent(i, k); a.n[k] += nor.getComponent(i, k); }
    for (let k = 0; k < 4; k++) a.w[k] += sw.getComponent(i, k);
    if (uv) for (let k = 0; k < 2; k++) a.u[k] += uv.getComponent(i, k);
    if (sm) a.m += sm.getX(i);
  }
  const indices = [], src = source.index.array;
  for (let i = 0; i < src.length; i += 3) {
    const a = map[src[i]], b = map[src[i + 1]], c = map[src[i + 2]];
    if (a !== b && b !== c && a !== c) indices.push(a, b, c);
  }
  const g = new THREE.BufferGeometry(), p = [], c = [], n = [], bones = [], weights = [], texcoords = [], skinMasks = [], surfaceClasses = [];
  for (const a of sums) {
    p.push(...a.p.map(v => v / a.count)); c.push(...a.c.map(v => v / a.count));
    const nn = new THREE.Vector3(...a.n).normalize(); n.push(nn.x, nn.y, nn.z);
    bones.push(...a.bones); weights.push(...a.w.map(v => v / a.count));
    if (uv) texcoords.push(...a.u.map(v => v / a.count));
    if (sm) skinMasks.push(a.m / a.count);
    if (sc) surfaceClasses.push(a.s);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(bones, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(texcoords, 2));
  if (sm) g.setAttribute('skinMask', new THREE.Float32BufferAttribute(skinMasks, 1));
  if (sc) g.setAttribute('surfaceClass', new THREE.Float32BufferAttribute(surfaceClasses, 1));
  g.setIndex(indices); g.computeBoundingSphere(); return g;
}

export function makeLod(source, ratio) {
  const box = source.boundingBox || (source.computeBoundingBox(), source.boundingBox);
  const size = box.getSize(new THREE.Vector3()), span = Math.max(size.x, size.y, size.z, 0.01);
  const target = source.index.count * ratio;
  let low = span / 100, high = span / 5, best = source.clone();
  for (let i = 0; i < 9; i++) {
    const cell = (low + high) / 2, candidate = clustered(source, cell);
    if (best !== source) best.dispose();
    best = candidate;
    if (candidate.index.count > target) low = cell; else high = cell;
  }
  return best;
}

export function makeBodyLods(parts) {
  for (const part of parts) {
    part.lodGeometries = [part.geometry, makeLod(part.geometry, 0.52), makeLod(part.geometry, 0.20)];
  }
}
