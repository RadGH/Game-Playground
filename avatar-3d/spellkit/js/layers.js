// Spell Kit pooled layers: ground decals + indicators, shells, ribbons, glow meshes, lights.
// Everything is made once at kit creation (so warm() can compile it) and reused: an effect borrows a pooled object,
// animates its uniforms, and hands it back. Nothing is created or disposed while a game runs.
import { GROUND_VS, GROUND_FS, SHELL_VS, SHELL_FS, RIBBON_VS, RIBBON_FS, GLOW_VS, GLOW_FS } from './shaders.js';

export const DECAL_SEGS = 24;

/** A pool of objects: get() hands out a free one (or steals the oldest), put() returns it. */
export class Pool {
  constructor(make, size) { this.items = []; for (let i = 0; i < size; i++) this.items.push(make(i)); this.clock = 0; this.steals = 0; this.peak = 0; }
  get() {
    let best = null;
    for (const it of this.items) if (!it.busy) { best = it; break; }
    if (!best) {   // all busy: steal the one handed out longest ago
      best = this.items.reduce((a, b) => (a.since < b.since ? a : b));
      this.steals++;
      best.owner?.steal?.(best);
    }
    best.busy = true; best.since = this.clock++; best.owner = null;
    this.peak = Math.max(this.peak, this.busy());
    return best;
  }
  put(it) {
    it.busy = false; it.owner = null;
    if (it.light) it.obj.intensity = 0;   // never hide a light: a change in the visible light count recompiles every lit material
    else it.obj.visible = false;
  }
  busy() { return this.items.reduce((n, it) => n + (it.busy ? 1 : 0), 0); }
  each(fn) { this.items.forEach(fn); }
}

// ---- ground: decals and indicators (both drape a grid over heightAt) ------------------------------------------------
export function makeGround(THREE, tex, segs = DECAL_SEGS) {
  const n = segs + 1;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * n * 3), loc = new Float32Array(n * n * 2), idx = [];
  for (let j = 0; j < segs; j++) for (let i = 0; i < segs; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aLocal', new THREE.BufferAttribute(loc, 2).setUsage(THREE.DynamicDrawUsage));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    name: 'spellkit-ground', vertexShader: GROUND_VS, fragmentShader: GROUND_FS,
    uniforms: {
      uMap: { value: tex.map('glow_holy') }, uRim: { value: tex.map('band_runes') },
      uCol: { value: new THREE.Color(1, 1, 1) }, uEdge: { value: new THREE.Color(0.5, 0.5, 0.5) },
      uOpacity: { value: 1 }, uRot: { value: 0 }, uScale: { value: 1 }, uHalf: { value: 1 }, uShape: { value: 0 },
      uDims: { value: new THREE.Vector3(1, 1, 0) }, uTime: { value: 0 },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 5; mesh.name = 'spellkit-ground';
  return { obj: mesh, segs, u: m.uniforms };
}

/**
 * Drape a ground item over the terrain. Local frame: x = right of `dir`, y = along `dir`.
 * box = [minX, maxX, minY, maxY] in metres; lift = metres above the ground.
 */
export function drape(item, heightAt, cx, cz, dir, box, lift = 0.04) {
  const g = item.obj.geometry, n = item.segs + 1;
  const pos = g.attributes.position.array, loc = g.attributes.aLocal.array;
  const fx = dir ? dir.x : 0, fz = dir ? dir.z : 1;   // forward
  const rx = fz, rz = -fx;                            // right
  let k = 0, l = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const lx = box[0] + (box[1] - box[0]) * i / item.segs, ly = box[2] + (box[3] - box[2]) * j / item.segs;
    const wx = cx + rx * lx + fx * ly, wz = cz + rz * lx + fz * ly;
    pos[k++] = wx; pos[k++] = (heightAt ? heightAt(wx, wz) : 0) + lift; pos[k++] = wz;
    loc[l++] = lx; loc[l++] = ly;
  }
  g.attributes.position.needsUpdate = true; g.attributes.aLocal.needsUpdate = true;
  g.computeBoundingSphere();
}

// ---- shells -----------------------------------------------------------------------------------------------------
export function shellGeometries(THREE) {
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true); cyl.translate(0, 0.5, 0);
  const cone = new THREE.CylinderGeometry(0.15, 1, 1, 48, 1, true); cone.translate(0, 0.5, 0);
  const funnel = new THREE.CylinderGeometry(1, 0.35, 1, 48, 1, true); funnel.translate(0, 0.5, 0);
  const dome = new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  // dome uv.y from the sphere runs top→bottom; flip so 0 = ground like the cylinders
  const uv = dome.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  const sphere = new THREE.SphereGeometry(1, 32, 16);
  return { cylinder: cyl, cone, funnel, dome, sphere };
}

export function makeShell(THREE, tex, geo) {
  const m = new THREE.ShaderMaterial({
    name: 'spellkit-shell', vertexShader: SHELL_VS, fragmentShader: SHELL_FS,
    uniforms: {
      uMap: { value: tex.map('band_light') }, uCol: { value: new THREE.Color(1, 1, 1) }, uEdge: { value: new THREE.Color(0.5, 0.5, 0.5) },
      uOpacity: { value: 1 }, uRepeat: { value: new THREE.Vector2(3, 1) }, uScroll: { value: new THREE.Vector2(0, 0) }, uFade: { value: 1.2 },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.visible = false; mesh.renderOrder = 8; mesh.frustumCulled = false; mesh.name = 'spellkit-shell';
  return { obj: mesh, u: m.uniforms };
}

// ---- ribbons ----------------------------------------------------------------------------------------------------
export const RIBBON_POINTS = 40;
export function makeRibbon(THREE, tex) {
  const N = RIBBON_POINTS;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 2 * 3), uv = new Float32Array(N * 2 * 2), fade = new Float32Array(N * 2), idx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aFade', new THREE.BufferAttribute(fade, 1).setUsage(THREE.DynamicDrawUsage));
  g.setIndex(idx);
  g.setDrawRange(0, 0);
  const m = new THREE.ShaderMaterial({
    name: 'spellkit-ribbon', vertexShader: RIBBON_VS, fragmentShader: RIBBON_FS,
    uniforms: {
      uMap: { value: tex.map('band_mist') }, uCol: { value: new THREE.Color(1, 1, 1) }, uEdge: { value: new THREE.Color(0.5, 0.5, 0.5) },
      uOpacity: { value: 1 }, uTexMix: { value: 0 }, uScroll: { value: 0 },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 10; mesh.name = 'spellkit-ribbon';
  return { obj: mesh, u: m.uniforms, N };
}

const _t = { a: null };
/**
 * Fill a ribbon from a list of points (head first). mode 'face' = turn the strip toward the camera (trails, arcs);
 * 'sweep' = pts are [base, tip] pairs (weapon trails): the strip spans base→tip.
 */
export function fillRibbon(THREE, rib, pts, { width = 0.2, camPos, taper = 1, fades = null, mode = 'face' }) {
  const g = rib.obj.geometry;
  const pos = g.attributes.position.array, uv = g.attributes.uv.array, fade = g.attributes.aFade.array;
  const n = mode === 'sweep' ? Math.min(rib.N, pts.length >> 1) : Math.min(rib.N, pts.length);
  if (!_t.a) { _t.a = new THREE.Vector3(); _t.b = new THREE.Vector3(); _t.c = new THREE.Vector3(); }
  const tan = _t.a, side = _t.b, view = _t.c;
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) : 0;
    const f = fades ? fades[i] : 1 - u;
    if (mode === 'sweep') {
      const b = pts[i * 2], t = pts[i * 2 + 1];
      pos.set([b.x, b.y, b.z], i * 6); pos.set([t.x, t.y, t.z], i * 6 + 3);
    } else {
      const p = pts[i], pa = pts[Math.max(0, i - 1)], pb = pts[Math.min(n - 1, i + 1)];
      tan.subVectors(pa, pb); if (tan.lengthSq() < 1e-10) tan.set(0, 0, 1);
      view.subVectors(camPos, p);
      side.crossVectors(tan, view).normalize().multiplyScalar(width * 0.5 * (1 - u * taper));
      pos[i * 6] = p.x + side.x; pos[i * 6 + 1] = p.y + side.y; pos[i * 6 + 2] = p.z + side.z;
      pos[i * 6 + 3] = p.x - side.x; pos[i * 6 + 4] = p.y - side.y; pos[i * 6 + 5] = p.z - side.z;
    }
    uv[i * 4] = u; uv[i * 4 + 1] = 0; uv[i * 4 + 2] = u; uv[i * 4 + 3] = 1;
    fade[i * 2] = fade[i * 2 + 1] = f;
  }
  g.setDrawRange(0, Math.max(0, n - 1) * 6);
  g.attributes.position.needsUpdate = g.attributes.uv.needsUpdate = g.attributes.aFade.needsUpdate = true;
  rib.obj.visible = n > 1;
}

// ---- glow meshes ------------------------------------------------------------------------------------------------
export function meshGeometries(THREE) {
  const spike = new THREE.ConeGeometry(0.5, 1, 12); spike.rotateX(Math.PI / 2);   // points along +z
  const shard = new THREE.OctahedronGeometry(0.5, 0); shard.scale(0.45, 0.45, 1.6);
  const core = new THREE.IcosahedronGeometry(0.5, 2);
  const ring = new THREE.TorusGeometry(0.5, 0.05, 8, 48); ring.rotateX(Math.PI / 2);
  const pillar = new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1, true); pillar.translate(0, 0.5, 0);
  const arrow = new THREE.CylinderGeometry(0.02, 0.02, 1, 6); arrow.rotateX(Math.PI / 2);
  return { spike, shard, core, ring, pillar, arrow };
}

export function makeGlow(THREE, geo) {
  const m = new THREE.ShaderMaterial({
    name: 'spellkit-glow', vertexShader: GLOW_VS, fragmentShader: GLOW_FS,
    uniforms: { uCol: { value: new THREE.Color(1, 1, 1) }, uEdge: { value: new THREE.Color(0.5, 0.5, 0.5) }, uOpacity: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.visible = false; mesh.renderOrder = 9; mesh.frustumCulled = false; mesh.name = 'spellkit-glow';
  return { obj: mesh, u: m.uniforms };
}

// ---- lights: always in the scene, always visible; only the intensity moves (shader-recompile rule) -------------
export function makeLight(THREE) {
  const l = new THREE.PointLight(0xffffff, 0, 8, 2);
  l.name = 'spellkit-light'; l.castShadow = false;
  return { obj: l, light: true };
}
