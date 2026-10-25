// Tall wheat on the farm fields, and the harvester that cuts it.
//
//   const wheat = createWheat({ THREE, scene, world, enhance, quality });
//   wheat.update(cameraPosition)           // builds / drops chunk meshes around the camera (cheap when nothing changed)
//   wheat.cut(cells)                       // mark cells cut (from the room, or from my own harvester) and redraw them
//   wheat.harvest(vehicle, def) -> cells   // the cells under a harvester's cutting header that are still standing
//
// Wheat grows on every `farm` surface sample (world.surface id 9) — the world's own 2 m grid — so a cell IS a world
// sample index (j * dim + i), the same number on every machine, and that is what `cut` messages carry. Drawing: the
// world is cut into 32 m chunks; a chunk within ~110 m of the camera is one InstancedMesh of wheat clumps (a few
// crossed cards with a head each), rebuilt only when a cell in it is cut. Nothing collides with wheat.
export const FARM = 9;
const CHUNK = 16;            // samples per chunk side (32 m)

export function createWheat({ THREE, scene, world, enhance = m => m, quality = 'medium' }) {
  const { dim, cell, size, surface } = world;
  const half = size / 2;
  const isWheat = new Uint8Array(dim * dim);
  let total = 0;
  for (let k = 0; k < dim * dim; k++) if (surface[k] === FARM) { isWheat[k] = 1; total++; }
  const isCut = new Uint8Array(dim * dim);
  let cutCount = 0;
  const per = quality === 'low' ? 2 : quality === 'high' ? 6 : 4;          // clumps per 2 m cell
  const range = quality === 'low' ? 70 : quality === 'high' ? 140 : 110;

  // one clump: three crossed cards with a wheat-coloured gradient (vertex colours) and a slight lean
  const clump = (() => {
    const g = new THREE.BufferGeometry(), pos = [], col = [];
    const base = new THREE.Color('#9a7a2a'), top = new THREE.Color('#e8c860');
    for (let c = 0; c < 3; c++) {
      const a = c * Math.PI / 3, dx = Math.cos(a) * 0.32, dz = Math.sin(a) * 0.32;
      const q = [[-dx, 0, -dz], [dx, 0, dz], [dx * 0.8, 1, dz * 0.8], [-dx * 0.8, 1, -dz * 0.8]];
      for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...q[i]); const cc = q[i][1] > 0.5 ? top : base; col.push(cc.r, cc.g, cc.b); }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  })();
  const mat = enhance(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const stubble = enhance(new THREE.MeshLambertMaterial({ color: '#a88a4a', side: THREE.DoubleSide }));
  const stubbleGeo = (() => { const g = clump.clone(); g.scale(1, 0.18, 1); return g; })();

  const chunks = new Map();     // key -> { mesh, stub, dirty }
  const nChunks = Math.ceil(dim / CHUNK);
  const hash = k => { let h = k * 2654435761 >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return (h >>> 0) / 4294967296; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  function buildChunk(ci, cj) {
    const stand = [], gone = [];
    for (let j = cj * CHUNK; j < Math.min(dim, (cj + 1) * CHUNK); j++) for (let i = ci * CHUNK; i < Math.min(dim, (ci + 1) * CHUNK); i++) {
      const k = j * dim + i;
      if (isWheat[k]) (isCut[k] ? gone : stand).push(k);
    }
    if (!stand.length && !gone.length) return null;
    const mk = (list, geo, m, n) => {
      if (!list.length) return null;
      const mesh = new THREE.InstancedMesh(geo, m, list.length * n);
      let c = 0;
      for (const k of list) {
        const i = k % dim, j = (k / dim) | 0;
        for (let r = 0; r < n; r++) {
          const x = -half + (i + hash(k * 7 + r) - 0.5) * cell, z = -half + (j + hash(k * 13 + r + 3) - 0.5) * cell;
          const hgt = 0.95 + hash(k * 3 + r) * 0.45;
          m4.compose(p3.set(x, world.heightAt(x, z) - 0.03, z), q.setFromAxisAngle(Y, hash(k + r * 17) * 6.28), s3.set(1, hgt, 1));
          mesh.setMatrixAt(c++, m4);
        }
      }
      mesh.count = c;
      mesh.computeBoundingSphere();          // three keeps the sphere from the first build otherwise (InstancedMesh gotcha)
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    };
    return { mesh: mk(stand, clump, mat, per), stub: mk(gone, stubbleGeo, stubble, Math.max(1, per >> 1)), dirty: false };
  }
  function drop(key) { const c = chunks.get(key); if (!c) return; for (const m of [c.mesh, c.stub]) if (m) { m.removeFromParent(); m.dispose(); } chunks.delete(key); }
  let lastCam = null, built = 0;
  function update(cam) {
    const moved = !lastCam || Math.hypot(cam.x - lastCam.x, cam.z - lastCam.z) > 8;
    if (moved) lastCam = { x: cam.x, z: cam.z };
    built = 0;
    const span = Math.ceil(range / (CHUNK * cell)) + 1;
    const ci0 = Math.floor((cam.x + half) / (CHUNK * cell)), cj0 = Math.floor((cam.z + half) / (CHUNK * cell));
    for (let cj = Math.max(0, cj0 - span); cj <= Math.min(nChunks - 1, cj0 + span); cj++) for (let ci = Math.max(0, ci0 - span); ci <= Math.min(nChunks - 1, ci0 + span); ci++) {
      const cx = -half + (ci + 0.5) * CHUNK * cell, cz = -half + (cj + 0.5) * CHUNK * cell;
      const near = Math.hypot(cx - cam.x, cz - cam.z) < range;
      const key = ci + ',' + cj;
      const c = chunks.get(key);
      if (near && (!c || c.dirty) && built < 2) { drop(key); const n = buildChunk(ci, cj); chunks.set(key, n || { empty: true }); built++; }
    }
    if (moved) for (const key of [...chunks.keys()]) {
      const [ci, cj] = key.split(',').map(Number);
      const cx = -half + (ci + 0.5) * CHUNK * cell, cz = -half + (cj + 0.5) * CHUNK * cell;
      if (Math.hypot(cx - cam.x, cz - cam.z) > range + 40) drop(key);
    }
  }
  function cut(cells) {
    let n = 0;
    for (const k of cells) {
      if (k < 0 || k >= isCut.length || !isWheat[k] || isCut[k]) continue;
      isCut[k] = 1; n++; cutCount++;
      const i = k % dim, j = (k / dim) | 0;
      const c = chunks.get(((i / CHUNK) | 0) + ',' + ((j / CHUNK) | 0));
      if (c) c.dirty = true;
    }
    return n;
  }
  /** Standing wheat under a harvester's header: def.harvest = { p: [x,y,z] header centre, hw half-width, hd half-depth }. */
  function harvest(veh, def) {
    const h = def.harvest;
    const c = veh.toWorld({ x: h.p[0], y: h.p[1], z: h.p[2] });
    const f = veh.toWorld({ x: h.p[0], y: h.p[1], z: h.p[2] + 1 });
    const fx = f.x - c.x, fz = f.z - c.z, fl = Math.hypot(fx, fz) || 1, ux = fx / fl, uz = fz / fl;
    const R = Math.hypot(h.hw, h.hd);
    const i0 = Math.max(0, Math.floor((c.x - R + half) / cell)), i1 = Math.min(dim - 1, Math.ceil((c.x + R + half) / cell));
    const j0 = Math.max(0, Math.floor((c.z - R + half) / cell)), j1 = Math.min(dim - 1, Math.ceil((c.z + R + half) / cell));
    const out = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * dim + i;
      if (!isWheat[k] || isCut[k]) continue;
      const dx = -half + i * cell - c.x, dz = -half + j * cell - c.z;
      const along = dx * ux + dz * uz, across = -dx * uz + dz * ux;
      if (Math.abs(along) <= h.hd + cell * 0.5 && Math.abs(across) <= h.hw) out.push(k);
    }
    return out;
  }
  return { update, cut, harvest, get total() { return total; }, get cutCount() { return cutCount; }, isWheat: k => !!isWheat[k], isCut: k => !!isCut[k],
    dispose() { for (const key of [...chunks.keys()]) drop(key); } };
}
