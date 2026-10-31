// Draws the rail cars: a near and a far instanced mesh per vehicle type (the two bakes from vehicle-bake.js), one shared
// wheel, one shared soft shadow. Nothing is sent to the GPU for a car behind the camera or past the fog.
//
//   const v = createTrafficView({ THREE, scene, traffic, types });      // traffic: rail-cars.js; types: Map(id -> baked vehicle)
//   v.update(camera, dt, tier, pile?)
import { paintMaterial, wheelGeometry } from './vehicle-bake.js';
import { TIERS } from './gfx-tier.js';

const NEAR = 45, NEAR_MAX = 8, CAP = 64;   // at most this many of one type, and of all cars, drawn at once

export function createTrafficView({ THREE, scene, traffic, types, extras }) {
  const mat = paintMaterial(THREE), group = new THREE.Group(); group.name = 'traffic'; scene.add(group);
  const meshes = new Map();
  const make = (geo, cap) => {
    const g = geo.clone();
    const fade = new THREE.InstancedBufferAttribute(new Float32Array(cap).fill(1), 1); fade.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iFade', fade);
    const m = new THREE.InstancedMesh(g, mat, cap);
    m.frustumCulled = false; m.count = 0;
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(m); return m;
  };
  for (const [id, t] of types) meshes.set(id, { near: make(t.near, NEAR_MAX), far: make(t.far, CAP), t });
  const wheelCap = CAP * 6;
  const wheels = new THREE.InstancedMesh(wheelGeometry(THREE), new THREE.MeshLambertMaterial({ vertexColors: true }), wheelCap);
  wheels.frustumCulled = false; wheels.count = 0; wheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(wheels);
  // the soft shadow: a dark blob under each car; on a phone this is all the shadow there is
  const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 6, 32, 32, 31); g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(0.7, 'rgba(0,0,0,0.42)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const blobGeo = new THREE.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, CAP);
  blobs.frustumCulled = false; blobs.count = 0; blobs.renderOrder = 2; group.add(blobs);

  const m4 = new THREE.Matrix4(), m5 = new THREE.Matrix4(), r4 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), e = new THREE.Euler(0, 0, 0, 'YXZ');
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), sphere = new THREE.Sphere();
  const seen = [];
  const tints = new Map();
  const tintOf = c => {
    const key = `${c.type}:${c.tint}`;
    if (tints.has(key)) return tints.get(key);
    const ex = extras.get(c.type), hex = ex?.tints?.length ? ex.tints[c.tint % ex.tints.length] : '#ffffff';
    const out = new THREE.Color(hex); tints.set(key, out); return out;
  };
  const poses = [];
  const stats = { near: 0, far: 0, drawn: 0 };

  return {
    group, stats, poses,
    update(camera, dt, tier, pile = null) {
      pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pv);
      const far = TIERS[tier].fogFar + 20, cam = camera.position;
      for (const m of meshes.values()) { m.near.count = 0; m.far.count = 0; }
      let wn = 0, bn = 0; stats.near = stats.far = 0;
      seen.length = 0;
      const list = traffic.parked?.length && !pile ? [...traffic.cars, ...traffic.parked] : traffic.cars;
      poses.length = list.length;
      list.forEach((c, idx) => {
        const q = poses[idx] ||= {};
        if (!c.fake) traffic.pose(c, q);
        if (pile) { const a = idx * 2.399, r = 5 + idx * 0.28; q.x = pile.x + Math.sin(a) * r; q.z = pile.z + Math.cos(a) * r; q.y = pile.y; q.yaw = a; q.pitch = 0; }
        const dx = q.x - cam.x, dy = q.y - cam.y, dz = q.z - cam.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > far) return;
        sphere.center.set(q.x, q.y + 1, q.z); sphere.radius = meshes.get(c.type).t.len * 0.7 + 1;
        if (!frustum.intersectsSphere(sphere)) return;
        seen.push({ c, q, d });
      });
      // the nearest few get every triangle; a ceiling, so a traffic jam can never break the budget
      seen.sort((a, b) => a.d - b.d);
      seen.length = Math.min(seen.length, CAP);
      seen.forEach(({ c, q, d }, rank) => {
        const t = meshes.get(c.type), info = t.t;
        e.set(q.pitch, q.yaw, q.roll || 0); r4.setFromEuler(e); p.set(q.x, q.y + info.lift, q.z); m4.compose(p, r4, s);
        const near = d < NEAR && rank < NEAR_MAX, target = near ? t.near : t.far, n = target.count;
        target.setMatrixAt(n, m4); target.setColorAt(n, tintOf(c));
        target.geometry.attributes.iFade.array[n] = c.fade; target.count = n + 1;
        if (near) stats.near++; else stats.far++;
        if (d < 150) for (const w of info.wheels) {
          q2.setFromAxisAngle(XAXIS, c.moved / w.r % 6.2832);
          m5.compose(WP.set(w.x, w.y, w.z), q2, WS.set(w.w, w.r, w.r)); m5.premultiply(m4);
          if (wn < wheelCap) wheels.setMatrixAt(wn++, m5);
        }
        if (bn < CAP) { m5.compose(WP.set(q.x, q.y + 0.14, q.z), r4, WS.set(info.width * 1.25, 1, info.len * 1.18)); blobs.setMatrixAt(bn++, m5); }
      });
      for (const m of meshes.values()) for (const k of [m.near, m.far]) { k.instanceMatrix.needsUpdate = true; k.instanceColor.needsUpdate = true; k.geometry.attributes.iFade.needsUpdate = true; k.visible = k.count > 0; }
      wheels.count = wn; wheels.instanceMatrix.needsUpdate = true; wheels.visible = wn > 0;
      blobs.count = bn; blobs.instanceMatrix.needsUpdate = true; blobs.visible = bn > 0;
      stats.drawn = stats.near + stats.far;
    },
  };
}
const XAXIS = { x: 1, y: 0, z: 0, isVector3: true };
const WP = { x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; } };
const WS = { x: 1, y: 1, z: 1, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; } };
