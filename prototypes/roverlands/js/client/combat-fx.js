// Rustwild effects (Expansion 1 M8): muzzle flashes, explosions, smoke and sparks as ONE particle cloud per blend
// (two draw calls for every effect on screen), and the raiders' shots as ONE instanced mesh of glowing, stretched
// balls (a tracer you can see coming). Nothing here decides anything — js/game/combat-play.js calls it.
//
//   const fx = createCombatFx({ THREE, scene });
//   fx.flash(p, kind)          a muzzle flash (kind: pellet | bolt | shell | slug | dart | scrap)
//   fx.boom(p, size)           an explosion: a fireball, sparks and a puff of smoke (size 1 = a shell, 2.5 = a camp going up)
//   fx.smoke(p, n, dark)       smoke rising (a wreck: call it a few times a second)
//   fx.spark(p)                a small hit
//   fx.shot(id, kind, p, d, v) a raider's shot starts flying (drawn until fx.endShot(id) or its life runs out)
//   fx.endShot(id)
//   fx.update(dt, camera)      every frame
//   fx.dispose()
import { FOE_SHOTS } from '../game/combat-data.js';

const N_ADD = 520, N_SMOKE = 360, N_SHOTS = 96;

function cloud(THREE, n, additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  const mat = new THREE.ShaderMaterial({
    uniforms: { scale: { value: 600 } },
    vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; uniform float scale;
      void main() { vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(size * scale / max(0.5, -mv.z), 220.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; varying vec3 vC;
      void main() { vec2 q = gl_PointCoord - 0.5; float d = length(q) * 2.0; if (d > 1.0) discard; float a = vA * (1.0 - d * d) ${additive ? '' : '* (0.75 + 0.25 * (1.0 - d))'}; gl_FragColor = vec4(vC * ${additive ? 'a' : '1.0'}, a); }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false; pts.renderOrder = additive ? 6 : 5;
  const P = { pts, n, pos, col, size, alpha, geo, mat, vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), grow: new Float32Array(n), s0: new Float32Array(n), a0: new Float32Array(n), up: new Float32Array(n), next: 0 };
  return P;
}
function emit(P, p, v, color, size, life, { grow = 0, alpha = 1, up = 0 } = {}) {
  const i = P.next; P.next = (P.next + 1) % P.n;
  P.pos[i * 3] = p[0]; P.pos[i * 3 + 1] = p[1]; P.pos[i * 3 + 2] = p[2];
  P.vel[i * 3] = v[0]; P.vel[i * 3 + 1] = v[1]; P.vel[i * 3 + 2] = v[2];
  P.col[i * 3] = color[0]; P.col[i * 3 + 1] = color[1]; P.col[i * 3 + 2] = color[2];
  P.life[i] = life; P.max[i] = life; P.s0[i] = size; P.size[i] = size; P.grow[i] = grow; P.a0[i] = alpha; P.alpha[i] = alpha; P.up[i] = up;
}
function stepCloud(P, dt, drag) {
  for (let i = 0; i < P.n; i++) {
    if (P.life[i] <= 0) { if (P.alpha[i] !== 0) P.alpha[i] = 0; continue; }
    P.life[i] -= dt;
    const k = Math.max(0, P.life[i] / P.max[i]);
    P.vel[i * 3 + 1] += P.up[i] * dt;
    const dd = Math.exp(-drag * dt);
    P.vel[i * 3] *= dd; P.vel[i * 3 + 1] *= dd; P.vel[i * 3 + 2] *= dd;
    P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
    P.size[i] = P.s0[i] + P.grow[i] * (1 - k);
    P.alpha[i] = P.a0[i] * (k < 0.7 ? k / 0.7 : 1);
  }
  for (const a of ['position', 'color', 'size', 'alpha']) P.geo.attributes[a].needsUpdate = true;
}
const hex = THREE => c => { const k = new THREE.Color(c); return [k.r, k.g, k.b]; };
const R = () => Math.random() - 0.5;

export function createCombatFx({ THREE, scene }) {
  const fire = cloud(THREE, N_ADD, true), smokeC = cloud(THREE, N_SMOKE, false);
  scene.add(fire.pts, smokeC.pts);
  const rgb = hex(THREE);
  const FLASH = { pellet: '#ffd27a', bolt: '#7fe8ff', shell: '#ffcf80', slug: '#ff8a3a', dart: '#ff4fd0', scrap: '#ffd84a', water: null };
  // the raiders' shots: one instanced, glowing, stretched ball each
  const shotGeo = new THREE.SphereGeometry(1, 10, 6);
  const shotMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
  const shotMesh = new THREE.InstancedMesh(shotGeo, shotMat, N_SHOTS);
  shotMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N_SHOTS * 3), 3);
  shotMesh.frustumCulled = false; shotMesh.count = 0; shotMesh.renderOrder = 7;
  scene.add(shotMesh);
  const live = new Map();        // id -> { kind, p, d, v, life }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1), dv = new THREE.Vector3(), sc = new THREE.Vector3(), pv = new THREE.Vector3(), col = new THREE.Color();

  const fx = {
    flash(p, kind = 'pellet') {
      const c = FLASH[kind]; if (!c) return;
      const big = kind === 'shell' ? 2.2 : kind === 'bolt' || kind === 'slug' ? 1.4 : 0.8;
      emit(fire, p, [0, 0, 0], rgb(c), big, 0.07, { grow: big * 0.6 });
      for (let k = 0; k < (kind === 'shell' ? 6 : 2); k++) emit(fire, p, [R() * 6, R() * 6, R() * 6], rgb('#fff2c0'), 0.25, 0.12);
      if (kind === 'shell') for (let k = 0; k < 4; k++) emit(smokeC, p, [R() * 2, 1 + Math.random(), R() * 2], [0.55, 0.53, 0.5], 1.2, 1.4, { grow: 2.4, alpha: 0.55 });
    },
    boom(p, size = 1) {
      const s = Math.max(0.4, size);
      emit(fire, p, [0, 0, 0], [1, 0.85, 0.5], 2.2 * s, 0.18, { grow: 3.2 * s });
      for (let k = 0; k < 10 * s; k++) emit(fire, [p[0] + R() * s, p[1] + R() * s, p[2] + R() * s], [R() * 4 * s, Math.random() * 3 * s, R() * 4 * s], rgb(k % 2 ? '#ff7a2a' : '#ffb84a'), 1.4 * s, 0.35 + Math.random() * 0.3, { grow: 1.6 * s, up: 2 });
      for (let k = 0; k < 12 * s; k++) emit(fire, p, [R() * 22, Math.random() * 14, R() * 22], rgb('#ffe9a0'), 0.18, 0.5 + Math.random() * 0.4, { up: -12 });
      for (let k = 0; k < 8 * s; k++) emit(smokeC, [p[0] + R() * 2 * s, p[1] + Math.random() * s, p[2] + R() * 2 * s], [R() * 2, 1.5 + Math.random() * 2, R() * 2], [0.24, 0.22, 0.21], 1.6 * s, 2.2 + Math.random(), { grow: 3.5 * s, alpha: 0.7 });
    },
    smoke(p, n = 1, dark = true) {
      for (let k = 0; k < n; k++) emit(smokeC, [p[0] + R() * 0.8, p[1], p[2] + R() * 0.8], [R() * 0.8 + 0.6, 2 + Math.random() * 1.5, R() * 0.8], dark ? [0.16, 0.15, 0.15] : [0.5, 0.48, 0.46], 1.0, 2.6 + Math.random(), { grow: 3, alpha: dark ? 0.6 : 0.45 });
      if (dark && Math.random() < 0.3) emit(fire, [p[0] + R() * 0.6, p[1] - 0.2, p[2] + R() * 0.6], [0, 1.5, 0], rgb('#ff6a20'), 0.7, 0.3, { grow: 0.4 });
    },
    spark(p) {
      for (let k = 0; k < 5; k++) emit(fire, p, [R() * 10, Math.random() * 6, R() * 10], rgb('#ffe28a'), 0.2, 0.25, { up: -10 });
      emit(smokeC, p, [0, 1, 0], [0.5, 0.48, 0.45], 0.6, 0.8, { grow: 1, alpha: 0.4 });
    },
    shot(id, kind, p, d, v) {
      const K = FOE_SHOTS[kind] || FOE_SHOTS.slug;
      live.set(id, { kind, K, p: p.slice(), d: d.slice(), v, life: K.life });
      fx.flash(p, kind);
    },
    endShot(id) { live.delete(id); },
    get shots() { return live.size; },
    update(dt, camera) {
      stepCloud(fire, dt, 2.2); stepCloud(smokeC, dt, 0.8);
      const h = (camera?.isPerspectiveCamera ? Math.tan(camera.fov * Math.PI / 360) : 1);
      const px = (typeof innerHeight === 'number' ? innerHeight : 720) / 2 / h;
      fire.mat.uniforms.scale.value = px; smokeC.mat.uniforms.scale.value = px;
      let n = 0;
      for (const [id, s] of live) {
        s.life -= dt;
        if (s.life <= 0) { live.delete(id); continue; }
        s.p[0] += s.d[0] * s.v * dt; s.p[1] += s.d[1] * s.v * dt; s.p[2] += s.d[2] * s.v * dt;
        if (n >= N_SHOTS) continue;
        dv.set(s.d[0], s.d[1], s.d[2]); q.setFromUnitVectors(zAxis, dv);
        const r = s.K.r; sc.set(r, r, r * (2.2 + s.v / 25));
        pv.set(s.p[0], s.p[1], s.p[2]);
        m4.compose(pv, q, sc); shotMesh.setMatrixAt(n, m4);
        col.set(s.K.col); shotMesh.setColorAt(n, col);
        n++;
      }
      shotMesh.count = n;
      shotMesh.instanceMatrix.needsUpdate = true;
      if (shotMesh.instanceColor) shotMesh.instanceColor.needsUpdate = true;
    },
    dispose() {
      for (const P of [fire, smokeC]) { P.pts.removeFromParent(); P.geo.dispose(); P.mat.dispose(); }
      shotMesh.removeFromParent(); shotGeo.dispose(); shotMat.dispose();
    },
  };
  return fx;
}
