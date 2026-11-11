// The 3D view: a stylised, flat-shaded low-poly world (ruling 14: phone first) under a Diablo-style angled camera.
// The camera looks NORTH (-z) from the south, tilted down ~55°, so screen-up is always world north (W = north).
import * as THREE from 'three';

export const CAM = { pitch: 0.84, dist: 14.5, fov: 36, yaw: 0 };     // yaw 0 = looking toward -z

export function createScene(canvas, { quality = 'high' } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality === 'low' ? 1 : 1.75));
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#9fd2e8');
  scene.fog = new THREE.Fog('#9fd2e8', 34, 70);
  const camera = new THREE.PerspectiveCamera(CAM.fov, 1, 0.5, 200);
  const hemi = new THREE.HemisphereLight('#fff6dc', '#4b6a3a', 1.25); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe2b0', 2.1);
  sun.position.set(-14, 26, 10); sun.castShadow = renderer.shadowMap.enabled;
  sun.shadow.mapSize.set(1024, 1024); const sc = sun.shadow.camera; sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.far = 80;
  sun.shadow.bias = -0.0008; scene.add(sun, sun.target);

  const focus = new THREE.Vector3();
  function follow(x, z, dt = 1) {
    const k = 1 - Math.exp(-dt * 8);
    focus.x += (x - focus.x) * k; focus.z += (z - focus.z) * k;
    const h = Math.sin(CAM.pitch) * CAM.dist, back = Math.cos(CAM.pitch) * CAM.dist;
    camera.position.set(focus.x - Math.sin(CAM.yaw) * back, h, focus.z + Math.cos(CAM.yaw) * back);
    camera.lookAt(focus.x, 0.8, focus.z);
    sun.position.set(focus.x - 14, 26, focus.z + 10); sun.target.position.set(focus.x, 0, focus.z);
  }
  function snapTo(x, z) { focus.set(x, 0, z); follow(x, z, 100); }
  /** Screen vector (x right, y down) -> world vector, using the camera's yaw. W/up = north whatever the yaw. */
  function screenToWorld(sx, sy) {
    const c = Math.cos(CAM.yaw), s = Math.sin(CAM.yaw);
    return [sx * c - sy * s, sx * s + sy * c];
  }
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    // a phone held upright sees as far sideways as a desktop: widen the view instead of cropping it
    camera.fov = w < h ? CAM.fov * 1.6 : CAM.fov; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();
  return { THREE, renderer, scene, camera, sun, follow, snapTo, screenToWorld, resize, render: () => renderer.render(scene, camera) };
}

// ---- the area: ground + props ----------------------------------------------------------------------------------------
const flat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
const MAT = {
  trunk: flat('#7a4f2e'), leaf: flat('#5fae3d'), leaf2: flat('#79c24a'), pine: flat('#2f7d47'), rock: flat('#9a9a94'),
  rock2: flat('#b8b4a8'), pole: flat('#5b3a22'), flame: new THREE.MeshBasicMaterial({ color: '#ffb240' }),
  petal: [flat('#f06aa8'), flat('#fff3a0'), flat('#ffffff'), flat('#b78cff')],
};
function jitter(geo, amt, seed) {
  const p = geo.attributes.position; let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!seen.has(k)) seen.set(k, [r() * amt, r() * amt, r() * amt]);
    const d = seen.get(k); p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  geo.computeVertexNormals(); return geo;
}
function groundMesh(area) {
  const B = area.bounds, w = B.x1 - B.x0, d = B.z1 - B.z0, seg = Math.round(w / 2.5);
  const geo = new THREE.PlaneGeometry(w + 40, d + 40, seg, seg); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, col = [];
  const c1 = new THREE.Color('#7cc152'), c2 = new THREE.Color('#5fa63e'), dirt = new THREE.Color('#c79a63'), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, (Math.sin(x * 0.21) * Math.cos(z * 0.17) + Math.sin(x * 0.05 + z * 0.07)) * 0.18);
    const n = (Math.sin(x * 0.31 + z * 0.13) + Math.cos(z * 0.27 - x * 0.11)) * 0.25 + 0.5;
    tmp.copy(c1).lerp(c2, n);
    const road = Math.max(0, 1 - Math.abs(x + Math.sin(z * 0.08) * 3) / 3.2) + Math.max(0, 1 - Math.hypot(x, z - 6) / 7);
    tmp.lerp(dirt, Math.min(1, road * 1.2));
    col.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.position.set((B.x0 + B.x1) / 2, 0, (B.z0 + B.z1) / 2); m.receiveShadow = true;
  return m;
}
/** Props as instanced meshes: one draw per part kind, however many trees. */
export function buildArea(view, area) {
  const g = new THREE.Group(); g.name = 'area';
  g.add(groundMesh(area));
  const parts = {
    tree: [[new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6).translate(0, 0.8, 0), MAT.trunk], [jitter(new THREE.IcosahedronGeometry(1.25, 0), 0.35, 7).translate(0, 2.4, 0), MAT.leaf], [jitter(new THREE.IcosahedronGeometry(0.8, 0), 0.25, 9).translate(0.5, 3.1, 0.2), MAT.leaf2]],
    pine: [[new THREE.CylinderGeometry(0.12, 0.2, 1, 5).translate(0, 0.5, 0), MAT.trunk], [new THREE.ConeGeometry(1.15, 1.8, 7).translate(0, 1.6, 0), MAT.pine], [new THREE.ConeGeometry(0.85, 1.5, 7).translate(0, 2.5, 0), MAT.pine], [new THREE.ConeGeometry(0.5, 1.1, 7).translate(0, 3.3, 0), MAT.pine]],
    rock: [[jitter(new THREE.DodecahedronGeometry(0.95, 0), 0.3, 3).scale(1, 0.7, 1).translate(0, 0.35, 0), MAT.rock], [jitter(new THREE.DodecahedronGeometry(0.5, 0), 0.15, 5).translate(0.7, 0.2, 0.4), MAT.rock2]],
    torch: [[new THREE.CylinderGeometry(0.07, 0.09, 1.5, 5).translate(0, 0.75, 0), MAT.pole], [new THREE.ConeGeometry(0.17, 0.4, 5).translate(0, 1.7, 0), MAT.flame]],
    flowers: MAT.petal.map((m, i) => [new THREE.IcosahedronGeometry(0.09, 0).translate(Math.cos(i * 1.7) * 0.5, 0.12, Math.sin(i * 1.7) * 0.5), m]),
  };
  const byKind = {}; for (const p of area.props) (byKind[p.kind] ||= []).push(p);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (const [kind, list] of Object.entries(byKind)) {
    for (const [geo, mat] of parts[kind] || []) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((p, i) => { q.setFromAxisAngle(up, p.yaw); mtx.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(p.s, p.s, p.s)); im.setMatrixAt(i, mtx); });
      im.castShadow = kind !== 'flowers'; im.receiveShadow = true; im.computeBoundingSphere();
      g.add(im);
    }
  }
  // a few real lights from the torches (capped — every light costs every pixel on a phone)
  for (const t of (byKind.torch || []).slice(0, 4)) { const l = new THREE.PointLight('#ffae55', 6, 7, 1.6); l.position.set(t.x, 1.9, t.z); g.add(l); }
  view.scene.add(g);
  return g;
}
