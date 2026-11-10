// The farm fields drawn (Expansion 1 M6): every cell of every field in its state, from the field state in
// js/game/jobs/farming.js (the page's copy of the room's farm).
//
//   const crops = createCrops({ THREE, scene, world, fields, farm, enhance, quality });
//   crops.dirty(ids)        cells changed: their fields are drawn again (soon, a field or two a frame)
//   crops.dirtyAll()
//   crops.update(camera, nowMs)   every frame: draws what changed, hides fields far from the camera, regrows sprouts
//   crops.dispose()
//
// One cell is a few "clumps" (2 / 3 / 5 by quality) of one look:
//   grown    the field's crop — wheat (gold cards with heads), carrots (green tufts + an orange shoulder), pumpkins
//            (an orange ball on a leaf), sunflowers (a stalk, a yellow face turned to the south)
//   cut      stubble (straw stalks for wheat + sunflowers, bare dug soil with a few leaves for the root crops)
//   planted  two dark seed furrows
//   watered  a dark wet patch with green sprouts that grow (scaled by how far the cell has grown)
// Each field is ONE InstancedMesh per look it has in it right now (at most 5, usually 1-3), so the whole belt is a few
// dozen draw calls at most, and only fields within range of the camera are drawn. Nothing here collides.
import { CELL, ST } from './jobs/farming.js';

const PER = { low: 2, medium: 4, high: 6, simple: 3 };
const RANGE = { low: 200, medium: 300, high: 420, simple: 220 };

export function createCrops({ THREE, scene, world, fields, farm, enhance = m => m, quality = 'medium' }) {
  const per = PER[quality] || 3, range = RANGE[quality] || 300;
  const C = c => new THREE.Color(c);
  // ---- shapes: small vertex-coloured meshes, built once
  function geo(build) {
    const pos = [], col = [];
    const quad = (a, b, c, d, ca, cb = ca, cc = cb, cd = cc) => { for (const [p, q] of [[a, ca], [b, cb], [c, cc], [a, ca], [c, cc], [d, cd]]) { pos.push(...p); col.push(q.r, q.g, q.b); } };
    const tri = (a, b, c, ca, cb = ca, cc = cb) => { for (const [p, q] of [[a, ca], [b, cb], [c, cc]]) { pos.push(...p); col.push(q.r, q.g, q.b); } };
    build({ quad, tri });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }
  // crossed cards: n cards, width w, height h, colours bottom -> top
  const cards = (n, w, h, lo, hi, lean = 0.8) => ({ quad }) => {
    for (let c = 0; c < n; c++) {
      const a = c * Math.PI / n, dx = Math.cos(a) * w / 2, dz = Math.sin(a) * w / 2;
      quad([-dx, 0, -dz], [dx, 0, dz], [dx * lean, h, dz * lean], [-dx * lean, h, -dz * lean], lo, lo, hi, hi);
    }
  };
  // a squashed ball with n sides (pumpkin, carrot top)
  const ball = (r, hy, y0, lo, hi, n = 6) => ({ tri }) => {
    const ring = (y, rr) => Array.from({ length: n }, (_, k) => [Math.cos(k / n * 6.283) * rr, y, Math.sin(k / n * 6.283) * rr]);
    const a = ring(y0 + hy * 0.5, r), top = [0, y0 + hy, 0], bot = [0, y0, 0];
    for (let k = 0; k < n; k++) { const p = a[k], q = a[(k + 1) % n]; tri(p, q, top, lo, lo, hi); tri(q, p, bot, lo, lo, lo); }
  };
  const G = {
    wheat: geo(cards(3, 0.46, 1.1, C('#8a6a22'), C('#f0d070'), 0.9)),
    carrot: geo(b => { cards(3, 0.42, 0.42, C('#2f6a22'), C('#6fb84a'), 1.3)(b); ball(0.07, 0.1, -0.02, C('#e07a1e'), C('#f39a3a'), 5)(b); }),
    pumpkin: geo(b => { ball(0.34, 0.42, 0, C('#d8661a'), C('#f08a2a'), 7)(b); cards(2, 0.7, 0.12, C('#2f6a22'), C('#4f8f32'), 1.4)(b); }),
    sunflower: geo(({ quad, tri }) => {
      const s = C('#4f7a2a'), s2 = C('#6f9a3a');
      quad([-0.03, 0, 0], [0.03, 0, 0], [0.03, 1.75, 0], [-0.03, 1.75, 0], s, s, s2, s2);
      quad([0, 0, -0.03], [0, 0, 0.03], [0, 1.75, 0.03], [0, 1.75, -0.03], s, s, s2, s2);
      quad([0, 0.8, 0], [0.3, 0.95, 0.05], [0.32, 1.05, 0], [0.05, 0.95, 0], C('#3f7a22'));
      // the face: a yellow ring of petals round a brown middle, tipped to face -z (the south)
      const y = 1.8, n = 8, R = 0.34, r = 0.14, face = (x, yy, zz) => [x, y + yy, zz];
      for (let k = 0; k < n; k++) {
        const a0 = k / n * 6.283, a1 = (k + 1) / n * 6.283;
        tri(face(0, 0, -0.06), face(Math.cos(a0) * r, Math.sin(a0) * r, -0.04), face(Math.cos(a1) * r, Math.sin(a1) * r, -0.04), C('#4a2a12'), C('#5a3818'));
        tri(face(Math.cos(a0) * r, Math.sin(a0) * r, -0.04), face(Math.cos((a0 + a1) / 2) * R, Math.sin((a0 + a1) / 2) * R, 0), face(Math.cos(a1) * r, Math.sin(a1) * r, -0.04), C('#f2c21a'), C('#ffd84a'));
      }
    }),
    stubble: geo(cards(3, 0.6, 0.2, C('#a88a4a'), C('#cdb070'))),
    dug: geo(({ quad }) => { const d = C('#5a4028'), d2 = C('#6a4a2e'); quad([-0.5, 0.03, -0.35], [0.5, 0.03, -0.35], [0.5, 0.06, 0.35], [-0.5, 0.06, 0.35], d, d, d2, d2); cards(2, 0.3, 0.12, C('#557a30'), C('#7a9a40'), 1.5)({ quad }); }),
    furrow: geo(({ quad }) => { const d = C('#3e2c1c'); for (const x of [-0.8, 0.8]) quad([x - 0.16, 0.05, -CELL / 2 + 0.2], [x + 0.16, 0.05, -CELL / 2 + 0.2], [x + 0.16, 0.05, CELL / 2 - 0.2], [x - 0.16, 0.05, CELL / 2 - 0.2], d); }),
    wet: geo(({ quad }) => { const d = C('#33261a'); quad([-CELL / 2 + 0.1, 0.04, -CELL / 2 + 0.1], [CELL / 2 - 0.1, 0.04, -CELL / 2 + 0.1], [CELL / 2 - 0.1, 0.04, CELL / 2 - 0.1], [-CELL / 2 + 0.1, 0.04, CELL / 2 - 0.1], d); }),
    sprout: geo(cards(2, 0.3, 0.5, C('#3f8a2a'), C('#8fd05a'), 1.2)),
  };
  // the furrow and wet patch are one per cell; the rest `per` (pumpkins: fewer, they are big)
  const COUNT = { wheat: per, carrot: per, pumpkin: Math.max(1, per - 1), sunflower: Math.max(1, per - 1), stubble: per, dug: Math.max(1, per >> 1), furrow: 1, wet: 1, sprout: per };
  const mat = enhance(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));

  const hash = k => { let h = Math.imul(k + 7, 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  // per field: { meshes: { look: InstancedMesh }, dirty, growing, built, shown }
  const F = fields.map(f => ({ f, meshes: {}, dirty: true, growing: false, builtAt: -1e9, shown: false }));
  const fieldIndex = id => { for (let k = 0; k < fields.length; k++) { const f = fields[k]; if (id >= f.base && id < f.base + f.count) return k; } return -1; };
  const heightOf = (f, x, z) => world.heightAt ? world.heightAt(x, z) : (f.y ?? 0);

  function meshFor(rec, look) {
    let m = rec.meshes[look];
    if (!m) {
      m = new THREE.InstancedMesh(G[look], mat, rec.f.count * COUNT[look]);
      m.receiveShadow = true; m.castShadow = false; m.count = 0;
      m.userData.cropLook = look;
      scene.add(m); rec.meshes[look] = m;
    }
    return m;
  }
  function build(rec, now) {
    const f = rec.f, n = {}, lists = {};
    const put = (look, x, y, z, yaw, sc, sy = sc) => {
      const m = lists[look] ||= meshFor(rec, look); n[look] ||= 0;
      m4.compose(p3.set(x, y, z), q.setFromAxisAngle(Y, yaw), s3.set(sc, sy, sc));
      m.setMatrixAt(n[look]++, m4);
    };
    let growing = false;
    for (let j = 0; j < f.rows; j++) for (let i = 0; i < f.cols; i++) {
      const id = f.base + j * f.cols + i, st = farm.state(id);
      const cx = f.x0 + (i + 0.5) * CELL, cz = f.z0 + (j + 0.5) * CELL, cy = heightOf(f, cx, cz) - 0.03;
      if (st === ST.PLANTED) { put('furrow', cx, cy, cz, 0, 1); continue; }
      if (st === ST.WATERED) {
        growing = true;
        put('wet', cx, cy, cz, 0, 1);
        const g = 0.25 + 0.75 * farm.progress(id, now);
        for (let r = 0; r < COUNT.sprout; r++) { const x = cx + (hash(id * 7 + r) - 0.5) * CELL * 0.85, z = cz + (hash(id * 13 + r + 3) - 0.5) * CELL * 0.85; put('sprout', x, cy, z, hash(id + r * 17) * 6.28, 0.8 + g, (0.3 + g * 1.6) * (f.crop === 'sunflower' ? 1.5 : 1)); }
        continue;
      }
      const look = st === ST.GROWN ? f.crop : (f.crop === 'carrot' || f.crop === 'pumpkin' ? 'dug' : 'stubble');
      for (let r = 0; r < COUNT[look]; r++) {
        const x = cx + (hash(id * 7 + r) - 0.5) * CELL * 0.9, z = cz + (hash(id * 13 + r + 3) - 0.5) * CELL * 0.9;
        const h = 0.85 + hash(id * 3 + r) * 0.4;
        // sunflowers all face the same way (south); everything else turns at random
        const yaw = look === 'sunflower' ? (hash(id + r) - 0.5) * 0.5 : hash(id + r * 17) * 6.28;
        put(look, x, cy, z, yaw, look === 'pumpkin' ? 0.8 + hash(id + r) * 0.5 : 1, look === 'pumpkin' ? 0.8 + hash(id + r) * 0.5 : h);
      }
    }
    for (const [look, m] of Object.entries(rec.meshes)) {
      m.count = n[look] || 0;
      m.instanceMatrix.needsUpdate = true;
      if (m.count) m.computeBoundingSphere();          // three keeps the first sphere otherwise (InstancedMesh gotcha)
      m.visible = rec.shown && m.count > 0;
    }
    rec.dirty = false; rec.growing = growing; rec.builtAt = now;
  }
  function dirty(ids) { const seen = new Set(); for (const id of ids) { const k = fieldIndex(id); if (k >= 0 && !seen.has(k)) { seen.add(k); F[k].dirty = true; } } }
  function dirtyAll() { for (const r of F) r.dirty = true; }
  function update(cam, now) {
    let builds = 0;
    for (const rec of F) {
      const f = rec.f;
      const dx = Math.max(0, Math.abs(cam.x - f.x) - f.w / 2), dz = Math.max(0, Math.abs(cam.z - f.z) - f.h / 2);
      const near = Math.hypot(dx, dz) < range;
      if (near !== rec.shown) { rec.shown = near; for (const m of Object.values(rec.meshes)) m.visible = near && m.count > 0; }
      if (!near) continue;
      // sprouts grow: a growing field is drawn again every few seconds
      if (rec.growing && now - rec.builtAt > 4000) rec.dirty = true;
      if (rec.dirty && builds < 1 && now - rec.builtAt > 120) { build(rec, now); builds++; }
    }
  }
  function dispose() { for (const rec of F) for (const m of Object.values(rec.meshes)) { m.removeFromParent(); m.dispose(); } for (const g of Object.values(G)) g.dispose(); mat.dispose(); }
  /** Draw calls the fields use right now (tests / debug). */
  const draws = () => F.reduce((a, r) => a + Object.values(r.meshes).filter(m => m.visible && m.count > 0).length, 0);
  return { update, dirty, dirtyAll, dispose, draws, get pending() { return F.filter(r => r.dirty && r.shown).length; } };
}
