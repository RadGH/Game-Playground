// The timber site as things you can see (rule 6: physical means physical). The huts are in the town batch; here are the rails, the
// saw benches and the racks (one merged mesh) and what moves: trees, stumps, logs, boards, the cart, the carriages and blades, the
// levers. Six instanced draws however many there are. What is where comes from the sim's site record, in town.mirror.site.
//
//   const v = createTimberView({ THREE, scene, world, town, Batch, rgb });
//   v.update(dt, tick, seconds)      v.place(personRow, tick, out)     v.mark(x, z) | v.mark(null)
import { Batch, rgb } from './batch.js';
import { needle } from '../world/job-kit.js';

const FALL_TICKS = 12, MAX_LOGS = 240, MAX_BOARDS = 170, MAX_PARTS = 16;
const CLIPS = { cut: 'lifeChop', pull: 'lifeLever', send: 'lifeLever', load: 'lifeLift', fetch: 'lifeLift', pick: 'lifeLift', bundle: 'lifeLift', haul: 'lifeCarry', go: 'walk', wait: 'idle' };
/** Three logs lie where a tree came down, in the direction it fell. */
export const logSpot = (T, i, n, dir) => { const a = dir + (n - 1) * 0.5, r = 1.1 + n * 0.55; return { x: T.trees[i].x + Math.sin(a) * r, z: T.trees[i].z + Math.cos(a) * r, yaw: a + 1.2 }; };

export function createTimberView({ THREE, scene, world, town }) {
  const T = world.timber, root = new THREE.Group(); root.name = 'timber'; scene.add(root);
  const Y = T.y, flat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const stats = { logs: 0, boards: 0, falling: 0, standing: 0 };
  // ---- what never moves
  {
    const B = new Batch(THREE), col = h => rgb(THREE, h), WOOD = col('#7a5a3a'), DARK = col('#4a3a2a'), STEEL = col('#8f979c'), DUST = col('#b39a6d'), YELLOW = col('#e0b93c');
    const [lx, lz] = T.landing, [dx, dz] = T.deck, L = Math.hypot(dx - lx, dz - lz), yaw = Math.atan2(dx - lx, dz - lz), mx = (lx + dx) / 2, mz = (lz + dz) / 2;
    for (const s of [-0.7, 0.7]) B.box(mx + Math.cos(yaw) * s, Y + 0.14, mz - Math.sin(yaw) * s, 0.06, 0.04, L / 2, yaw, STEEL);
    for (let i = 0; i < L / 2; i++) { const u = i * 2 - L / 2 + 1; B.box(mx + Math.sin(yaw) * u, Y + 0.04, mz + Math.cos(yaw) * u, 1.05, 0.05, 0.16, yaw, DARK); }
    B.box(lx, Y + 0.02, lz, 3.2, 0.03, 2.8, 0, DUST); B.box(dx, Y + 0.02, dz, 4.6, 0.03, 4, 0, DUST);
    for (const s of [-1, 1]) { B.box(dx + s * 4.4, Y, dz, 0.16, 0.8, 4, 0, WOOD); B.box(lx + s * 3, Y, lz, 0.14, 0.5, 2.6, 0, WOOD); }
    for (const b of T.benches) {
      const z = b.infeed[1], x0 = b.infeed[0], x1 = b.out[0], cx = (x0 + x1) / 2, hw = (x1 - x0) / 2;
      B.box(cx, Y + 0.72, z, hw, 0.05, 0.62, 0, WOOD);
      for (let x = x0 + 1; x < x1; x += 5) for (const s of [-1, 1]) B.box(x, Y, z + s * 0.55, 0.1, 0.36, 0.1, 0, DARK);
      B.box(b.blade[0], Y, z + 0.82, 0.24, 0.72, 0.16, 0, STEEL); B.box(b.blade[0], Y + 1.3, z, 0.34, 0.22, 0.98, 0, YELLOW);
      B.box(b.lever[0], Y, b.lever[1], 0.28, 0.3, 0.28, 0, DARK);
      B.box(cx, Y + 0.02, z + 1.4, hw + 1, 0.02, 2.4, 0, DUST);
    }
    { const [rx, rz] = T.rack; for (const s of [-1, 1]) for (const e of [-1, 1]) B.box(rx + s * 3.4, Y, rz + e * 1.6, 0.1, 1.2, 0.1, 0, DARK); B.box(rx, Y + 0.02, rz, 3.8, 0.02, 2, 0, DUST); }
    B.box(T.lever[0], Y, T.lever[1], 0.28, 0.3, 0.28, 0, DARK);
    for (let a = 0; a < 26; a++) { const t = a / 26 * 6.283, q = [T.centre[0] + Math.cos(t) * 28, T.centre[1] + 70 + Math.sin(t) * 0]; void q; }
    const m = new THREE.Mesh(B.geometry(), flat); m.matrixAutoUpdate = false; m.receiveShadow = true; root.add(m);
  }
  // ---- what moves
  const tints = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const join = list => {
    const pos = [], nor = [], col = [];
    for (const [g0, hex] of list) { const g = tints(g0.index ? g0.toNonIndexed() : g0, hex); g.computeVertexNormals(); for (const [out, k] of [[pos, 'position'], [nor, 'normal'], [col, 'color']]) out.push(...g.attributes[k].array); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  };
  const treeGeo = (() => {
    const tr = new THREE.CylinderGeometry(0.2, 0.32, 3.4, 6); tr.translate(0, 1.7, 0);
    const c1 = new THREE.ConeGeometry(2.3, 3.8, 7); c1.translate(0, 4, 0); const c2 = new THREE.ConeGeometry(1.8, 3.4, 7); c2.translate(0, 5.8, 0); const c3 = new THREE.ConeGeometry(1.15, 2.8, 6); c3.translate(0, 7.5, 0);
    return join([[tr, '#6b4a30'], [c1, '#37703a'], [c2, '#3f7c40'], [c3, '#478846']]);
  })();
  const stumpGeo = (() => { const g = new THREE.CylinderGeometry(0.3, 0.36, 0.5, 7); g.translate(0, 0.25, 0); const top = new THREE.CircleGeometry(0.29, 7).rotateX(-Math.PI / 2); top.translate(0, 0.505, 0); return join([[g, '#6b4a30'], [top, '#d6b98a']]); })();
  const logGeo = (() => { const g = new THREE.CylinderGeometry(0.2, 0.22, 3, 7).rotateZ(Math.PI / 2); const a = new THREE.CircleGeometry(0.21, 7).rotateY(Math.PI / 2); a.translate(1.51, 0, 0); const b = new THREE.CircleGeometry(0.21, 7).rotateY(-Math.PI / 2); b.translate(-1.51, 0, 0); return join([[g, '#6e4d30'], [a, '#d6b98a'], [b, '#d6b98a']]); })();
  const boardGeo = join([[new THREE.BoxGeometry(3, 0.26, 0.86), '#d9bd8c']]), boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const pool = (g, cap, mat = flat) => { const m = new THREE.InstancedMesh(g, mat, cap); m.frustumCulled = false; m.count = 0; root.add(m); return m; };
  const trees = pool(treeGeo, T.trees.length), stumps = pool(stumpGeo, T.trees.length), logs = pool(logGeo, MAX_LOGS), boards = pool(boardGeo, MAX_BOARDS);
  const parts = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), MAX_PARTS); parts.frustumCulled = false; parts.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTS * 3).fill(1), 3); root.add(parts);
  trees.castShadow = true; logs.castShadow = true;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.05, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd23c', transparent: true, opacity: 0.9, depthWrite: false })); ring.visible = false; ring.renderOrder = 3; root.add(ring);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1), c3 = new THREE.Color();
  const set = (mesh, i, x, y, z, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = 1, sz = 1) => { e.set(pitch, yaw, roll); m4.compose(p3.set(x, y, z), q.setFromEuler(e), s3.set(sx, sy, sz)); mesh.setMatrixAt(i, m4); };
  const yards = world.buildings.filter(b => b.use === 'lumber_yard').map(b => ({ b, id: town.roster?.places.find(p => p.building === b.id)?.id ?? null, x: b.x + Math.sin(b.yaw) * (b.d / 2 + 1.5) - Math.cos(b.yaw) * 4, z: b.z + Math.cos(b.yaw) * (b.d / 2 + 1.5) + Math.sin(b.yaw) * 4 }));
  let seen = null, lastTick = -1, shake = new Map(), carried = [];

  function drawStill(site, tick) {
    let nt = 0, ns = 0, nl = 0, nb = 0;
    stats.falling = 0;
    site.trees.forEach(([st, cuts, lying, t, dir], i) => {
      const P = T.trees[i];
      if (st === 0) {
        const hit = shake.get(i) ?? 0, lean = hit * 0.05 + cuts * 0.006, grow = t > 0 ? Math.min(1, 0.25 + (tick - t) / 200) : 1;
        set(trees, nt++, P.x, Y, P.z, P.tint * 6.28, lean, 0, P.s * grow, P.s * grow, P.s * grow);
      } else {
        set(stumps, ns++, P.x, Y, P.z, P.tint * 6.28);
        const u = (tick - t) / FALL_TICKS;
        if (st === 1 && u < 1) {       // on its way down: it pivots on the stump, slowly and then all at once
          stats.falling++;
          set(trees, nt++, P.x, Y + 0.45, P.z, dir, u * u * Math.PI * 0.5, 0, P.s, P.s, P.s);
        } else for (let n = 0; n < lying && nl < MAX_LOGS; n++) { const s = logSpot(T, i, n, dir); set(logs, nl++, s.x, Y + 0.22, s.z, s.yaw); }
      }
    });
    const heap = (list, n, x, z, yaw, rowW, y0 = 0) => { for (let i = 0; i < n && nl < MAX_LOGS; i++) { const r = Math.floor(i / rowW), k = i % rowW; list(x + (k - (rowW - 1) / 2) * 0.46, y0 + 0.22 + r * 0.4, z, yaw); } };
    const logAt = (x, y, z, yaw) => set(logs, nl++, x, Y + y, z, yaw);
    heap(logAt, site.landing, T.landing[0], T.landing[1], Math.PI / 2, 8);
    heap(logAt, site.deck, T.deck[0], T.deck[1], Math.PI / 2, 12);
    trees.count = nt; stumps.count = ns;
    // boards: a bundle is one box, stacked crosswise
    const stack = (n, x, z, wide) => { for (let i = 0; i < n && nb < MAX_BOARDS; i++) { const r = Math.floor(i / wide), k = i % wide; set(boards, nb++, x, Y + 0.16 + r * 0.27, z + (k - (wide - 1) / 2) * 0.92, 0); } };
    const per = town.roster?.work.planksPerLog ?? 4;
    stack(Math.ceil(site.rack / per), T.rack[0], T.rack[1], 3);
    site.benches.forEach(([, , out], i) => { if (out) stack(Math.ceil(out / per), T.benches[i].out[0], T.benches[i].out[1] + 2, 1); });
    for (const y of yards) { y.id ??= town.roster?.places.find(p => p.building === y.b.id)?.id ?? null; stack(Math.min(40, Math.ceil((site.yards[y.id] ?? 0) / per / 2)), y.x, y.z, 3); }
    logs.userData.still = nl; boards.count = nb;
    logs.instanceMatrix.needsUpdate = trees.instanceMatrix.needsUpdate = stumps.instanceMatrix.needsUpdate = boards.instanceMatrix.needsUpdate = true;
    stats.logs = nl; stats.boards = nb; stats.standing = nt;
  }
  function drawParts(site, tick, seconds) {
    const k = town.roster?.work; if (!k) return;
    let n = 0;
    const paint = (hex) => parts.setColorAt(n, c3.set(hex));
    const trip = k.cartSeconds * 4, C = site.cart, u = C.st === 0 ? 0 : C.st === 1 ? Math.min(1, (tick - C.t) / trip) : 1 - Math.min(1, (tick - C.t) / trip);
    const [lx, lz] = T.landing, [dx, dz] = T.deck, cx = lx + (dx - lx) * u, cz = lz + (dz - lz) * u, yaw = Math.atan2(dx - lx, dz - lz);
    set(parts, n, cx, Y + 0.42, cz, yaw, 0, 0, 2.1, 0.32, 3.2); paint('#55606a'); n++;
    set(parts, n, T.lever[0], Y + 0.95, T.lever[1], 0, 0, C.st ? -0.5 : 0.5, 0.1, 1.2, 0.1); paint('#c2493d'); n++;
    let nl = logs.userData.still ?? 0;
    for (let i = 0; i < Math.min(C.load, 6) && nl < MAX_LOGS; i++) set(logs, nl++, cx + (i % 3 - 1) * 0.5, Y + 0.8 + Math.floor(i / 3) * 0.4, cz, yaw + Math.PI / 2);
    site.benches.forEach(([log, cuts], i) => {
      const B = T.benches[i], wave = needle(seconds + i * 0.37, k.pullSeconds * 2), x = B.blade[0] + (wave - 0.5) * 7;
      set(parts, n, x, Y + 0.86, B.blade[1], 0, 0, 0, 3.4, 0.08, 1.1); paint('#7a5a3a'); n++;
      if (log && nl < MAX_LOGS) { set(logs, nl++, x, Y + 1.12, B.blade[1], 0, 0, 0, 1, 1 - cuts * 0.17, 1 - cuts * 0.12); }
      set(parts, n, B.blade[0], Y + 1.05, B.blade[1], 0, seconds * 18, 0, 0.05, 1, 1); paint('#c9d2d8'); n++;
      set(parts, n, B.lever[0], Y + 0.95, B.lever[1], 0, 0, log ? 0.4 : -0.4, 0.1, 1.2, 0.1); paint('#c2493d'); n++;
    });
    for (const c of carried) { if (nl >= MAX_LOGS) break; set(logs, nl++, c.x, c.y, c.z, c.yaw + Math.PI / 2 + 0.5, 0, 0.12); }
    parts.count = n; parts.instanceMatrix.needsUpdate = true; if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
    logs.count = nl; logs.instanceMatrix.needsUpdate = true;
  }
  const self = {
    root, stats, T,
    /** Whoever is on the site, between the two ends of what they are doing. False if the sim has not said yet. */
    place(p, tick, out) {
      const k = p.tk;
      if (!k) { if (p.x == null) return false; out.x = p.x; out.z = p.z; out.y = Y + 0.06; out.yaw = p.h ?? 0; out.anim = 'idle'; return true; }
      const u = Math.max(0, Math.min(1, (tick - k.st) / Math.max(1, k.en - k.st))), mover = k.x0 !== k.x1 || k.z0 !== k.z1;
      out.x = k.x0 + (k.x1 - k.x0) * u; out.z = k.z0 + (k.z1 - k.z0) * u; out.y = Y + 0.06;
      if (mover) { out.yaw = Math.atan2(k.x1 - k.x0, k.z1 - k.z0); out.walking = true; out.speed = 3.4; }
      else if (k.k === 'cut' || k.k === 'pull') { const sp = k.k === 'cut' ? T.trees[k.ref] : null; if (sp) { const a = Math.atan2(sp.x - out.x, sp.z - out.z); out.yaw = a; } }
      out.anim = (p.cy && mover) ? 'lifeCarry' : CLIPS[k.k] || 'idle';
      out.carry = p.cy ?? null;
      return true;
    },
    /** Someone with a log or boards on them, this frame. */
    carrying(list) { carried = list; },
    hit(i) { shake.set(i, 1); },
    mark(x, z, y = Y) { ring.visible = x != null; if (x != null) ring.position.set(x, y + 0.09, z); },
    update(dt, tick, seconds) {
      const site = town.mirror.site; if (!site) return;
      for (const [i, v] of shake) { const n = v - dt * 4; if (n <= 0) shake.delete(i); else shake.set(i, n); }
      const moving = stats.falling > 0 || shake.size > 0, changed = site !== seen;
      if (changed || moving || tick - lastTick > 8) { seen = site; lastTick = tick; drawStill(site, tick); }
      drawParts(site, tick, seconds);
      ring.rotation.y += dt;
    },
  };
  return self;
}
