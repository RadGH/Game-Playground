// A plain world renderer with the same contract as js/client/world-view (docs/PLAN.md "Client world view contract"):
// one terrain mesh coloured by surface, flat-shaded instanced shapes for the objects, a water sheet, tyre tracks and
// dust. It is the fallback when the full view fails to load, the "Simple" graphics setting for weak phones, and what
// the lead tuned the driving on before the full view existed. `?view=simple` forces it.
export function createSimpleView({ THREE, renderer, scene, camera, world }) {
  const SURF_COL = ['#6f8f3e', '#8a6a44', '#4a3a28', '#d8c08a', '#9a948a', '#8a8580', '#eef2f6', '#5d5a55', '#cfe6f5', '#9a7a4a', '#7fa0aa'];
  scene.background = new THREE.Color('#a9c6e0');
  scene.fog = new THREE.Fog('#b8cde0', 120, 700);
  const hemi = new THREE.HemisphereLight('#dfeeff', '#5a5a40', 1.1); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e0', 2.0);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 });
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(0.45, 0.8, 0.35).normalize();

  // terrain: every second sample (4 m), coloured by the surface under each vertex
  const step = 2, n = Math.floor((world.dim - 1) / step) + 1, half = world.size / 2, cs = world.cell * step;
  const geo = new THREE.PlaneGeometry(world.size, world.size, n - 1, n - 1); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = -half + i * cs, z = -half + j * cs;
    pos.setY(k, world.heightAt(x, z));
    c.set(SURF_COL[world.surfaceAt(x, z)?.id ?? 0] || '#6f8f3e');
    const shade = 0.88 + ((i * 7 + j * 13) % 5) * 0.03;
    col[k * 3] = c.r * shade; col[k * 3 + 1] = c.g * shade; col[k * 3 + 2] = c.b * shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true; scene.add(ground);

  // water: a sheet wherever the world says there is water
  const wgeo = new THREE.PlaneGeometry(world.size, world.size, n - 1, n - 1); wgeo.rotateX(-Math.PI / 2);
  const wp = wgeo.attributes.position;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = -half + i * cs, z = -half + j * cs;
    const wh = world.waterAt(x, z);
    wp.setY(k, wh != null ? wh : world.heightAt(x, z) - 3);
  }
  wgeo.computeVertexNormals();
  scene.add(new THREE.Mesh(wgeo, new THREE.MeshStandardMaterial({ color: '#3d7896', transparent: true, opacity: 0.72, roughness: 0.15, metalness: 0.1 })));

  // objects: instanced by shape + kind colour
  const KCOL = { tree: '#3c5e2e', sapling: '#5a8a3a', bush: '#4e7a36', fern: '#5e8f40', reeds: '#8a9a50', fence: '#8a6a44', post: '#6a5034', log: '#6b4a30',
    rock: '#7d7a76', boulder: '#6e6b67', ramp: '#9a7a50', crate: '#a07a44', barrel: '#7a3a2a', hay: '#d0b060', sign: '#8a6a44', bridge: '#7a5a3a', default: '#888' };
  const kc = kind => KCOL[Object.keys(KCOL).find(k => kind?.startsWith(k)) || 'default'];
  const groups = new Map();
  const objs = world.objects || [];
  for (const o of objs) {
    if (!o.shape) continue;
    const key = o.shape.t + ':' + kc(o.kind);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  }
  const index = new Map();           // object id -> [mesh, instance]
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const shapeMat = (o) => {
    const sh = o.shape;
    if (sh.t === 'cyl') { s3.set(sh.r, sh.h, sh.r); p3.set(o.x, o.y + sh.h / 2, o.z); }
    else if (sh.t === 'box') { s3.set(sh.hx * 2, sh.hy * 2, sh.hz * 2); p3.set(o.x, o.y + sh.hy, o.z); }
    else if (sh.t === 'ball') { s3.set(sh.r, sh.r, sh.r); p3.set(o.x, o.y + sh.r, o.z); }
    else if (sh.t === 'wedge') { s3.set(sh.hx * 2, sh.hy * 2, sh.hz * 2); p3.set(o.x, o.y, o.z); }
    q.setFromAxisAngle(Y, o.yaw || 0);
    return m4.compose(p3, q, s3);
  };
  const wedgeGeo = (() => { const g = new THREE.BufferGeometry(); const v = [-.5, 0, -.5, .5, 0, -.5, -.5, 0, .5, .5, 0, .5, -.5, 1, .5, .5, 1, .5];
    const idx = [0, 2, 1, 1, 2, 3, 0, 1, 4, 1, 5, 4, 2, 4, 3, 3, 4, 5, 0, 4, 2, 1, 3, 5];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex(idx); const ng = g.toNonIndexed(); ng.computeVertexNormals(); return ng; })();
  const GEO = { cyl: new THREE.CylinderGeometry(1, 1, 1, 7), box: new THREE.BoxGeometry(1, 1, 1), ball: new THREE.IcosahedronGeometry(1, 0), wedge: wedgeGeo };
  const crowns = [];
  for (const [key, list] of groups) {
    const [t, colr] = key.split(':');
    const mesh = new THREE.InstancedMesh(GEO[t], new THREE.MeshLambertMaterial({ color: colr, flatShading: true }), list.length);
    list.forEach((o, i) => { mesh.setMatrixAt(i, shapeMat(o)); index.set(o.id, [mesh, i]); if (o.kind?.startsWith('tree')) crowns.push(o); });
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }
  // tree crowns: a cone on every trunk
  const crownMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshLambertMaterial({ color: '#2f5a2a', flatShading: true }), Math.max(1, crowns.length));
  const crownIdx = new Map();
  crowns.forEach((o, i) => {
    const h = o.shape.h || 6, r = Math.max(1.2, (o.shape.r || 0.3) * 6);
    m4.compose(p3.set(o.x, o.y + h * 0.55 + h * 0.45, o.z), q.identity(), s3.set(r, h * 0.9, r)); crownMesh.setMatrixAt(i, m4); crownIdx.set(o.id, i);
  });
  crownMesh.castShadow = true; crownMesh.computeBoundingSphere(); scene.add(crownMesh);
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);

  // tyre tracks: one ribbon per wheel, a ring buffer of quads
  const MAXQ = 6000;
  const tg = new THREE.BufferGeometry();
  const tpos = new Float32Array(MAXQ * 6 * 3), tcol = new Float32Array(MAXQ * 6 * 4);
  tg.setAttribute('position', new THREE.BufferAttribute(tpos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(tcol, 4));
  const tmesh = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  tmesh.frustumCulled = false; tmesh.renderOrder = 1; scene.add(tmesh);
  let tq = 0;
  const last = new Map();
  const tracks = {
    add(key, x, y, z, nx, ny, nz, width, surf, dx, dz) {
      const prev = last.get(key);
      const l = Math.hypot(dx, dz) || 1, sx = -dz / l * width / 2, sz = dx / l * width / 2;
      const a = [x - sx, y + 0.03, z - sz], b = [x + sx, y + 0.03, z + sz];
      if (prev && Math.hypot(x - prev.x, z - prev.z) < 1.5) {
        const o = (tq % MAXQ) * 18, oc = (tq % MAXQ) * 24;
        const quad = [prev.a, prev.b, b, prev.a, b, a];
        quad.forEach((v, i) => { tpos[o + i * 3] = v[0]; tpos[o + i * 3 + 1] = v[1]; tpos[o + i * 3 + 2] = v[2]; });
        const rut = [0.15, 0.45, 1, 0.7, 0.3, 0, 0.8, 0.05, 0.05, 0.55, 0.3][surf] ?? 0.2;
        for (let i = 0; i < 6; i++) { tcol[oc + i * 4] = 0.12; tcol[oc + i * 4 + 1] = 0.1; tcol[oc + i * 4 + 2] = 0.08; tcol[oc + i * 4 + 3] = 0.25 + rut * 0.5; }
        tq++;
        tg.attributes.position.needsUpdate = true; tg.attributes.color.needsUpdate = true;
        tg.setDrawRange(0, Math.min(tq, MAXQ) * 6);
      }
      last.set(key, { x, z, a, b });
    },
    lift(key) { last.delete(key); },
  };

  // dust: a small pool of sprites
  const dustMat = new THREE.SpriteMaterial({ color: '#b09a7a', transparent: true, opacity: 0.5, depthWrite: false });
  const puffs = [];
  function dust(x, y, z, surf, amount = 0.5) {
    if (puffs.length > 120) return;
    const m = new THREE.Sprite(dustMat.clone());
    m.material.color.set(SURF_COL[surf] || '#b09a7a').lerp(new THREE.Color('#d8d0c0'), 0.4);
    m.position.set(x, y, z); m.scale.setScalar(0.4 + amount);
    scene.add(m);
    puffs.push({ m, life: 1.2, vy: 0.6 + Math.random() * 0.6, grow: 1.5 + amount * 2 });
  }

  return {
    sunDir, csm: null,
    enhance: m => m,
    update(dt, cam) {
      sun.position.copy(cam.position).addScaledVector(sunDir, 120);
      sun.target.position.copy(cam.position);
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i]; p.life -= dt;
        p.m.position.y += p.vy * dt; p.m.scale.multiplyScalar(1 + p.grow * dt * 0.5); p.m.material.opacity = Math.max(0, p.life / 1.2 * 0.45);
        if (p.life <= 0) { p.m.removeFromParent(); p.m.material.dispose(); puffs.splice(i, 1); }
      }
    },
    breakObject(id, { dir } = {}) {
      const hit = index.get(id);
      if (hit) { hit[0].setMatrixAt(hit[1], hide); hit[0].instanceMatrix.needsUpdate = true; }
      const ci = crownIdx.get(id);
      if (ci != null) { crownMesh.setMatrixAt(ci, hide); crownMesh.instanceMatrix.needsUpdate = true; }
    },
    objectPiece(id) {
      const o = objs[id]; if (!o?.shape) return null;
      const g = new THREE.Group();
      const sh = o.shape;
      const mat = new THREE.MeshLambertMaterial({ color: kc(o.kind), flatShading: true });
      let m;
      if (sh.t === 'cyl') { m = new THREE.Mesh(GEO.cyl, mat); m.scale.set(sh.r, sh.h, sh.r); m.position.y = sh.h / 2; }
      else if (sh.t === 'box') { m = new THREE.Mesh(GEO.box, mat); m.scale.set(sh.hx * 2, sh.hy * 2, sh.hz * 2); m.position.y = sh.hy; }
      else { m = new THREE.Mesh(GEO.ball, mat); m.scale.setScalar(sh.r || 0.5); m.position.y = sh.r || 0.5; }
      m.castShadow = true; g.add(m);
      if (o.kind?.startsWith('tree')) {
        const h = sh.h || 6, r = Math.max(1.2, (sh.r || 0.3) * 6);
        const cr = new THREE.Mesh(crownMesh.geometry, crownMesh.material); cr.scale.set(r, h * 0.9, r); cr.position.y = h; g.add(cr);
      }
      scene.add(g);
      return g;
    },
    tracks, dust, splash: (x, y, z, a) => dust(x, y, z, 10, a),
    mapImage(size = 512) {
      const cv = document.createElement('canvas'); cv.width = cv.height = size;
      const g = cv.getContext('2d'), img = g.createImageData(size, size);
      for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
        const x = -half + (i + 0.5) / size * world.size, z = -half + (j + 0.5) / size * world.size;
        const wh = world.waterAt(x, z);
        c.set(wh != null ? '#3d7896' : SURF_COL[world.surfaceAt(x, z)?.id ?? 0]);
        const h0 = world.heightAt(x, z), h1 = world.heightAt(x + 3, z + 3);
        const sh = Math.max(0.6, Math.min(1.3, 1 + (h0 - h1) * 0.08));
        const k = (j * size + i) * 4;
        img.data[k] = c.r * 255 * sh; img.data[k + 1] = c.g * 255 * sh; img.data[k + 2] = c.b * 255 * sh; img.data[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      return cv;
    },
    setQuality() {},
  };
}
