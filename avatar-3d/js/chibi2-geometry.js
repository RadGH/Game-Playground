import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Profile rings are [height, half-width, half-depth, forward offset].
export function profile(rings, segments = 12) {
  const positions = [], indices = [];
  for (const [y, rx, rz, z = 0] of rings) {
    for (let j = 0; j <= segments; j++) {
      const a = j / segments * Math.PI * 2;
      positions.push(Math.sin(a) * rx, y, Math.cos(a) * rz + z);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < segments; j++) {
    const a = i * (segments + 1) + j, b = a + segments + 1;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices); g.computeVertexNormals();
  // Weld normals across the circular UV seam without welding the vertices.
  const n = g.attributes.normal;
  for (let i = 0; i < rings.length; i++) {
    const a = i * (segments + 1), b = a + segments;
    const v = new THREE.Vector3(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, v.x, v.y, v.z); n.setXYZ(b, v.x, v.y, v.z);
  }
  return g;
}

export function taperedCurve(points, radii, sides = 6, steps = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, steps, 1, sides, false);
  const p = g.attributes.position;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, center = curve.getPointAt(t), f = t * (radii.length - 1);
    const r = THREE.MathUtils.lerp(radii[Math.floor(f)], radii[Math.min(radii.length - 1, Math.floor(f) + 1)], f % 1);
    for (let j = 0; j <= sides; j++) {
      const k = i * (sides + 1) + j;
      p.setXYZ(k, center.x + (p.getX(k) - center.x) * r, center.y + (p.getY(k) - center.y) * r, center.z + (p.getZ(k) - center.z) * r);
    }
  }
  g.computeVertexNormals(); return g;
}

export function createRig(body) {
  const clamp = (v, fallback) => Number.isFinite(v) ? THREE.MathUtils.clamp(v, 0, 1) : fallback;
  const leg = 0.53 * (0.8 + clamp(body.height, 0.5) * 0.4);
  const wide = 0.8 + clamp(body.width, 0.5) * 0.4;
  const headScale = 0.86 + clamp(body.headSize, 0.5) * 0.28;
  const torso = 0.94 + clamp(body.height, 0.5) * 0.12;
  const bones = [], byName = {};
  function bone(name, parent, pos) {
    const b = new THREE.Bone(); b.name = name; b.position.set(...pos);
    b.userData.index = bones.length; bones.push(b); byName[name] = b;
    if (parent) byName[parent].add(b);
    return b;
  }
  const root = bone('root', null, [0, 0, 0]);
  bone('hips', 'root', [0, leg + 0.07, 0]);
  bone('chest', 'hips', [0, 0.15 * torso, 0]);
  bone('head', 'chest', [0, 0.38 * torso, 0]);
  bone('eyeL', 'head', [-0.12 * headScale, 0.25 * headScale, 0.255 * headScale]);
  bone('eyeR', 'head', [0.12 * headScale, 0.25 * headScale, 0.255 * headScale]);
  for (const [side, s] of [['L', -1], ['R', 1]]) {
    bone('arm' + side, 'chest', [s * 0.255 * wide, 0.24 * torso, 0]);
    bone('elbow' + side, 'arm' + side, [0, -0.21 * torso, 0]);
    bone('hand' + side, 'elbow' + side, [0, -0.205 * torso, 0]);
    bone('leg' + side, 'hips', [s * 0.115 * wide, 0, 0]);
    bone('knee' + side, 'leg' + side, [0, -leg * 0.51, 0]);
    bone('foot' + side, 'knee' + side, [0, -leg * 0.49, 0]);
  }
  root.updateMatrixWorld(true);
  return { root, bones, byName, leg, wide, headScale, torso, height: leg + 0.07 + 0.53 * torso + 0.60 * headScale };
}

/** Assemble in bind space. All material buckets use the same skeleton, including rigid equipment. */
export class SkinBuilder {
  constructor(rig) { this.rig = rig; this.buckets = { cloth: [], metal: [] }; }
  add(geometry, boneName, color, { position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0], metal = false, bend = null } = {}) {
    const bone = this.rig.byName[boneName], count = geometry.attributes.position.count;
    const local = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    geometry.applyMatrix4(local);
    const skinIndices = new Uint16Array(count * 4), weights = new Float32Array(count * 4), colors = new Float32Array(count * 3);
    const c = new THREE.Color(color), p = geometry.attributes.position;
    for (let i = 0; i < count; i++) {
      const mix = bend ? THREE.MathUtils.smoothstep(-p.getY(i), bend.at - bend.width, bend.at + bend.width) : 0;
      skinIndices[i * 4] = bone.userData.index;
      skinIndices[i * 4 + 1] = bend ? this.rig.byName[bend.bone].userData.index : 0;
      weights[i * 4] = 1 - mix; weights[i * 4 + 1] = mix;
      // A restrained vertical tint makes large cloth surfaces legible at game distance.
      const tint = metal ? 1 : 0.94 + 0.06 * THREE.MathUtils.clamp(p.getY(i) + 0.5, 0, 1);
      colors.set([c.r * tint, c.g * tint, c.b * tint], i * 3);
    }
    geometry.applyMatrix4(bone.matrixWorld);
    geometry.deleteAttribute('uv');
    if (!geometry.index) geometry.setIndex(Array.from({ length: count }, (_, i) => i));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    this.buckets[metal ? 'metal' : 'cloth'].push(geometry);
  }
  finish() {
    const result = [];
    for (const [name, parts] of Object.entries(this.buckets)) {
      if (!parts.length) continue;
      const geometry = mergeGeometries(parts);
      for (const p of parts) p.dispose();
      if (!geometry) throw new Error('Chibi 2 geometry assembly failed');
      geometry.computeBoundingSphere();
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: name === 'metal' ? 0.38 : 0.82, metalness: name === 'metal' ? 0.65 : 0 });
      result.push({ name, geometry, material });
    }
    return result;
  }
}
