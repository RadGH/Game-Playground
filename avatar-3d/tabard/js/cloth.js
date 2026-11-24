// Tabard cloth + the small physics core the hair layer shares (round 4, 2026-11-23).
//
//   Verlet           — points joined by sticks, pulled toward a rest shape, pushed out of the body. Fixed 1/120 s steps
//                      (frame-rate independent), at most 8 steps a frame (a slow frame never explodes), pinned points
//                      follow their holder smoothly between frames, and a holder that jumps (a teleport, a respawn)
//                      resets everything to the rest shape instead of whipping across the map.
//   bodyColliders()  — capsules fitted to THIS body's mesh per bone (two side by side where the body is wider than deep,
//                      e.g. the chest), so hair and cloth slide over the real torso, shoulders and legs.
//   createCloth()    — any prop with props.json `place.cloth` becomes cloth: a coarse grid of points over the prop's
//                      sheet, its top edge pinned to the holder (the bone socket), the prop's own vertices carried by
//                      the grid (bilinear + their offset from it, so the modelled bow and the torn hem stay).
//
// place.cloth options (all optional — see WORKFLOW.md §2d):
//   pin: 'top' | 'top-front' | 'top-back'   which edge is sewn on (top-front/top-back: the same top edge; the name says
//                                            which side of the body the piece hangs, for readers — colliders work
//                                            either way)
//   pinRows: 1            rows of grid points held by the holder (2 = a stiffer yoke)
//   cols: 7, rows: 9      grid size (points). Cost grows with cols×rows; 7×9 is plenty for a cape
//   down: [0,0,-1]        the sheet's top→bottom direction in the holder's frame (the prop file's -Z after the Y-up turn)
//   out: [0,1,0]          the side facing away from the body, in the holder's frame
//   stiffness: 0.002      pull back to the modelled shape per 1/120 s step at the free edge (0 = pure cloth;
//                         gravity moves a point ~0.7 mm a step, so 0.02 already holds it like a board)
//   topStiffness: 0.06    the same just under the pinned row (eases down to `stiffness`)
//   damping: 0.04         speed lost per step (higher = heavier, slower cloth)
//   gravity: 9.8          m/s², straight down in the world
//   colliders: [...]      bone groups it slides over (default: torso, pelvis, thighs, calves, upper arms)
//   margin: 0.025         how far (m) the cloth stays off a collider (the grid is coarse, so keep a margin)
//   oneSided: false       true = the sheet must stay on its `out` side of every collider: a point inside a limb or in
//                         its shadow behind it is pushed back out to the front (a flap in front of a running thigh)
//   substeps: 1           physics steps per 1/120 s (2 = 1/240 s: for fast limbs)
import * as THREE from 'three';

export const STEP = 1 / 120;
const MAX_STEPS = 8;

/** Points + sticks. Positions are world space. `t1` = where each point's rest shape is this frame, `t0` last frame. */
export class Verlet {
  constructor(n) {
    this.n = n;
    this.p = new Float32Array(n * 3); this.q = new Float32Array(n * 3);          // now, previous step
    this.t0 = new Float32Array(n * 3); this.t1 = new Float32Array(n * 3);        // rest targets, last frame / now
    this.pin = new Uint8Array(n); this.pull = new Float32Array(n); this.rad = new Float32Array(n).fill(0.01);
    this.links = []; this.lens = null; this.stiff = null;
    this.damping = 0.04; this.gravity = -9.8; this.iters = 3; this.jump = 0.6; this.acc = 0; this.ready = false;
  }
  link(a, b, stiff = 1) { this.links.push(a, b); (this._s ||= []).push(stiff); }
  /** Rest lengths come from the rest targets (called on reset, so a scaled character gets scaled sticks). */
  measure() {
    const L = this.links, t = this.t1; this.lens = new Float32Array(L.length / 2); this.stiff = Float32Array.from(this._s || []);
    for (let i = 0, k = 0; i < L.length; i += 2, k++) {
      const a = L[i] * 3, b = L[i + 1] * 3;
      this.lens[k] = Math.hypot(t[a] - t[b], t[a + 1] - t[b + 1], t[a + 2] - t[b + 2]);
    }
  }
  /** Everything back to the rest shape, then `settle` steps holding the targets still (so it starts hanging). */
  reset(colliders, settle = 0) {
    this.measure(); this.p.set(this.t1); this.q.set(this.t1); this.t0.set(this.t1); this.ready = true; this.acc = 0;
    for (let s = 0; s < settle; s++) this._sub(1, colliders);
  }
  /** Advance by dt seconds. Call after filling t1 (and t0 keeps last frame's t1). */
  step(dt, colliders) {
    if (!this.ready) { this.reset(colliders, 60); return; }
    let jump = 0;
    for (let i = 0; i < this.n; i++) if (this.pin[i]) {
      const k = i * 3; jump = Math.max(jump, Math.hypot(this.t1[k] - this.t0[k], this.t1[k + 1] - this.t0[k + 1], this.t1[k + 2] - this.t0[k + 2]));
    }
    if (jump > this.jump || !(dt >= 0)) { this.reset(colliders, 60); return; }      // teleported: start hanging again
    this.acc += Math.min(dt, 0.25);
    const h = STEP / (this.sub || 1);
    let steps = Math.floor(this.acc / h);
    if (steps > MAX_STEPS * (this.sub || 1)) { steps = MAX_STEPS * (this.sub || 1); this.acc = 0; } else this.acc -= steps * h;
    const t0 = this.t0, t1 = this.t1;
    if (steps === 0) { t0.set(t1); return; }
    // targets slide from last frame's to this frame's over the steps (a fast head turn drags the hair smoothly)
    const from = this._from ||= new Float32Array(this.n * 3); from.set(t0);
    for (let s = 1; s <= steps; s++) {
      const a = s / steps;
      for (let i = 0; i < t0.length; i++) t0[i] = from[i] + (t1[i] - from[i]) * a;
      this._sub(0, colliders, t0);
    }
    t0.set(t1);
  }
  _sub(still, colliders, tgt = this.t1) {
    const hs = STEP / (this.sub || 1), d = 1 - this.damping / (this.sub || 1), g = this.gravity * hs * hs;
    const { p, q, pin, n } = this, pull = this.pull;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      if (pin[i]) { p[k] = q[k] = tgt[k]; p[k + 1] = q[k + 1] = tgt[k + 1]; p[k + 2] = q[k + 2] = tgt[k + 2]; continue; }
      for (let c = 0; c < 3; c++) {
        const v = (p[k + c] - q[k + c]) * d; q[k + c] = p[k + c]; p[k + c] += v + (c === 1 ? g : 0);
        p[k + c] += (tgt[k + c] - p[k + c]) * pull[i] / (this.sub || 1);
      }
    }
    const L = this.links, lens = this.lens, st = this.stiff;
    for (let it = 0; it < this.iters; it++) {
      for (let j = 0, m = 0; j < L.length; j += 2, m++) {
        const a = L[j], b = L[j + 1], ka = a * 3, kb = b * 3;
        const dx = p[kb] - p[ka], dy = p[kb + 1] - p[ka + 1], dz = p[kb + 2] - p[ka + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const wa = pin[a] ? 0 : 1, wb = pin[b] ? 0 : 1; if (wa + wb === 0) continue;
        const f = (len - lens[m]) / len / (wa + wb) * st[m];
        p[ka] += dx * f * wa; p[ka + 1] += dy * f * wa; p[ka + 2] += dz * f * wa;
        p[kb] -= dx * f * wb; p[kb + 1] -= dy * f * wb; p[kb + 2] -= dz * f * wb;
      }
    }
    if (colliders) collide(this, colliders);   // once a step, after the sticks (every pass cost 6× for no visible gain)
  }
}

/** Push every free point out of every sphere / capsule (world space, from colliders.world()). */
function collide(v, C) {
  const { p, pin, rad, n } = v, list = C.list, sd = v.side;   // sd: one-sided (a sheet that must stay on that side)
  for (let i = 0; i < n; i++) {
    if (pin[i]) continue;
    const k = i * 3;
    for (let j = 0; j < list.length; j++) {
      const c = list[j]; let cx, cy, cz;
      if (c.b) {   // capsule: nearest point on the segment
        const ax = c.a[0], ay = c.a[1], az = c.a[2], bx = c.b[0] - ax, by = c.b[1] - ay, bz = c.b[2] - az;
        const L2 = bx * bx + by * by + bz * bz || 1e-9;
        let t = ((p[k] - ax) * bx + (p[k + 1] - ay) * by + (p[k + 2] - az) * bz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        cx = ax + bx * t; cy = ay + by * t; cz = az + bz * t;
      } else { cx = c.a[0]; cy = c.a[1]; cz = c.a[2]; }
      const dx = p[k] - cx, dy = p[k + 1] - cy, dz = p[k + 2] - cz, r = c.r + rad[i];
      if (sd) {
        // one-sided: everything inside the limb OR in its shadow behind it (seen from the sheet's side) goes back out
        // to the front, along the side direction. A fast thigh can then never carry a point through to its back.
        const dn = dx * sd[0] + dy * sd[1] + dz * sd[2], lat2 = dx * dx + dy * dy + dz * dz - dn * dn;
        if (lat2 < r * r) { const h = Math.sqrt(r * r - lat2); if (dn < h) { const m = h - dn; p[k] += sd[0] * m; p[k + 1] += sd[1] * m; p[k + 2] += sd[2] * m; } }
        continue;
      }
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 1e-6, f = r / d;
        p[k] = cx + dx * f; p[k + 1] = cy + dy * f; p[k + 2] = cz + dz * f;
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------ body colliders
// Bone groups (a capsule from a bone to its child, fitted to the vertices that bone mostly moves).
export const COLLIDER_GROUPS = {
  torso: [['spine_01', 'spine_02'], ['spine_02', 'spine_03'], ['spine_03', 'neck_01']],
  pelvis: [['pelvis', 'spine_01']],
  thighs: [['thigh_l', 'calf_l'], ['thigh_r', 'calf_r']],
  calves: [['calf_l', 'foot_l'], ['calf_r', 'foot_r']],
  arms: [['upperarm_l', 'lowerarm_l'], ['upperarm_r', 'lowerarm_r']],
  shoulders: [['clavicle_l', 'upperarm_l'], ['clavicle_r', 'upperarm_r']],
  neck: [['neck_01', 'Head']],
};
const fitCache = new Map();
const _m = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

/** Capsules fitted to the body's bind pose, each in its bone's own frame (so they follow the bone). Cached per body. */
export function fitCapsules(bodyMesh, pairs) {
  const key = bodyMesh.geometry.uuid + '|' + pairs.map(p => p.join('>')).join(',');
  if (fitCache.has(key)) return fitCache.get(key);
  const sk = bodyMesh.skeleton, names = sk.bones.map(b => b.name);
  const geo = bodyMesh.geometry, pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const bindOf = i => new THREE.Matrix4().copy(sk.boneInverses[i]).invert();     // bone frame -> bind (mesh) space
  const out = [];
  for (const [na, nb] of pairs) {
    const ia = names.indexOf(na), ib = names.indexOf(nb); if (ia < 0 || ib < 0) continue;
    const A = new THREE.Vector3().setFromMatrixPosition(bindOf(ia)), B = new THREE.Vector3().setFromMatrixPosition(bindOf(ib));
    const ax = B.clone().sub(A), len = ax.length(); ax.normalize();
    // the body's side (X) and front (Z) directions, made square to the bone
    const side = new THREE.Vector3(1, 0, 0).addScaledVector(ax, -ax.x).normalize();
    const front = new THREE.Vector3().crossVectors(ax, side).normalize();
    if (front.z < 0) front.negate();
    const xs = [], zs = [];
    for (let i = 0; i < pos.count; i++) {
      let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === ia) w += sw.getComponent(i, k);
      if (w < 0.5) continue;
      _a.fromBufferAttribute(pos, i).applyMatrix4(bodyMesh.bindMatrix).sub(A);
      const t = _a.dot(ax) / len; if (t < 0.05 || t > 0.95) continue;
      xs.push(_a.dot(side)); zs.push(_a.dot(front));
    }
    if (xs.length < 6) continue;
    const pct = (arr, f) => { const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * f))]; };
    const zc = (pct(zs, 0.85) + pct(zs, 0.15)) / 2, xc = (pct(xs, 0.85) + pct(xs, 0.15)) / 2;
    const halfW = (pct(xs, 0.9) - pct(xs, 0.1)) / 2, halfD = (pct(zs, 0.9) - pct(zs, 0.1)) / 2;
    const inv = sk.boneInverses[ia];
    const add = (dx, r) => {
      const o = side.clone().multiplyScalar(xc + dx).addScaledVector(front, zc);
      out.push({ bone: na, a: A.clone().add(o).applyMatrix4(inv), b: B.clone().add(o).applyMatrix4(inv), r });
    };
    if (halfW > halfD * 1.35) { add(-(halfW - halfD), halfD); add(halfW - halfD, halfD); }   // wide: two side by side
    else add(0, (halfW + halfD) / 2);
  }
  fitCache.set(key, out);
  return out;
}

/** World-space colliders for a character: { list, update() } — update() after the skeleton is posed this frame. */
export function bodyColliders(bodyMesh, bones, groups = ['torso', 'pelvis', 'thighs', 'calves', 'arms'], extra = []) {
  const pairs = groups.flatMap(g => COLLIDER_GROUPS[g] || []);
  const caps = fitCapsules(bodyMesh, pairs);
  const list = caps.map(c => ({ a: [0, 0, 0], b: [0, 0, 0], r: c.r, src: c })).concat(extra);
  const ws = new THREE.Vector3();
  return {
    list,
    update() {
      for (const c of list) {
        if (!c.src) { c.update?.(c); continue; }
        const bone = bones[c.src.bone]; if (!bone) continue;
        _a.copy(c.src.a).applyMatrix4(bone.matrixWorld); _b.copy(c.src.b).applyMatrix4(bone.matrixWorld);
        c.a[0] = _a.x; c.a[1] = _a.y; c.a[2] = _a.z; c.b[0] = _b.x; c.b[1] = _b.y; c.b[2] = _b.z;
        bone.matrixWorld.decompose(_c, _q, ws); c.r = c.src.r * ws.x;
      }
    },
  };
}
const _q = new THREE.Quaternion();

// ------------------------------------------------------------------------------------------------ cloth props
/**
 * Make a prop's sheet move as cloth. holder = the socket group on the bone (its frame: x side, -z down, +y away from
 * the body for the capes). Returns { update(dt), reset(), dispose(), points } — tabard.js calls update after posing.
 */
export function createCloth({ holder, bodyMesh, bones, opts = {} }) {
  const o = { pin: 'top', pinRows: 1, cols: 7, rows: 9, down: [0, 0, -1], out: [0, 1, 0], stiffness: 0.002, topStiffness: 0.06,
    damping: 0.04, gravity: 9.8, colliders: ['torso', 'pelvis', 'thighs', 'calves', 'arms'], margin: 0.025, oneSided: false, substeps: 1, ...opts };
  const meshes = []; holder.traverse(m => { if (m.isMesh) meshes.push(m); });
  holder.updateWorldMatrix(true, true);
  const hInv = holder.matrixWorld.clone().invert();
  const down = new THREE.Vector3(...o.down).normalize(), out = new THREE.Vector3(...o.out).normalize();
  const side = new THREE.Vector3().crossVectors(out, down).normalize();
  // every vertex of the sheet in holder space -> (s: across, h: down from the top, d: off the sheet's middle surface)
  const verts = [];
  for (const m of meshes) {
    m.geometry = m.geometry.clone();                    // our own copy: we move its points
    m.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage); m.geometry.attributes.normal?.setUsage(THREE.DynamicDrawUsage);
    const rel = hInv.clone().multiply(m.matrixWorld), pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      _a.fromBufferAttribute(pos, i).applyMatrix4(rel);
      const nAttr = m.geometry.attributes.normal;
      const flip = nAttr ? _b.fromBufferAttribute(nAttr, i).transformDirection(rel).dot(out) < 0 : false;
      verts.push({ m, i, s: _a.dot(side), h: _a.dot(down), d: _a.dot(out), flip });
    }
  }
  let s0 = Infinity, s1 = -Infinity, h0 = Infinity, h1 = -Infinity;
  for (const v of verts) { s0 = Math.min(s0, v.s); s1 = Math.max(s1, v.s); h0 = Math.min(h0, v.h); h1 = Math.max(h1, v.h); }
  const C = o.cols, R = o.rows, ds = (s1 - s0) / (C - 1) || 1, dh = (h1 - h0) / (R - 1) || 1;
  // the sheet's middle surface depth at each grid point (average of nearby vertices: keeps the modelled bow)
  const depth = new Float32Array(C * R);
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const gs = s0 + c * ds, gh = h0 + r * dh; let sw = 0, sd = 0;
    for (const v of verts) { const w = 1 / (0.0004 + (v.s - gs) ** 2 + (v.h - gh) ** 2); sw += w; sd += v.d * w; }
    depth[r * C + c] = sd / sw;
  }
  const rest = [];   // grid rest points, holder space
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++)
    rest.push(new THREE.Vector3().addScaledVector(side, s0 + c * ds).addScaledVector(down, h0 + r * dh).addScaledVector(out, depth[r * C + c]));
  // each vertex: its grid cell + where in it + its offset off the bilinear middle surface
  for (const v of verts) {
    const fc = Math.min(C - 1.0001, Math.max(0, (v.s - s0) / ds)), fr = Math.min(R - 1.0001, Math.max(0, (v.h - h0) / dh));
    v.c = Math.floor(fc); v.r = Math.floor(fr); v.u = fc - v.c; v.w = fr - v.r;
    const k = v.r * C + v.c, dd = depth[k] * (1 - v.u) * (1 - v.w) + depth[k + 1] * v.u * (1 - v.w) + depth[k + C] * (1 - v.u) * v.w + depth[k + C + 1] * v.u * v.w;
    v.off = v.d - dd;
  }
  const V = new Verlet(C * R);
  V.damping = o.damping; V.gravity = -o.gravity; V.sub = Math.max(1, o.substeps | 0);
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const i = r * C + c;
    if (r < o.pinRows) V.pin[i] = 1;
    const f = (r - o.pinRows + 1) / Math.max(1, R - o.pinRows);
    V.pull[i] = o.topStiffness + (o.stiffness - o.topStiffness) * Math.min(1, Math.max(0, f)) ** 0.7;
    V.rad[i] = o.margin;
    if (c + 1 < C) V.link(i, i + 1, 1);
    if (r + 1 < R) V.link(i, i + C, 1);
    if (c + 1 < C && r + 1 < R) { V.link(i, i + C + 1, 0.5); V.link(i + 1, i + C, 0.5); }
    if (r + 2 < R) V.link(i, i + 2 * C, 0.3);           // bend: keeps it from folding like paper
  }
  const cols = bodyColliders(bodyMesh, bones, o.colliders);
  const tgt = () => { for (let i = 0; i < rest.length; i++) { _a.copy(rest[i]).applyMatrix4(holder.matrixWorld); V.t1[i * 3] = _a.x; V.t1[i * 3 + 1] = _a.y; V.t1[i * 3 + 2] = _a.z; } };
  const P = (i, t) => t.set(V.p[i * 3], V.p[i * 3 + 1], V.p[i * 3 + 2]);
  const nrm = new Float32Array(C * R * 3);
  const _n = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _p = new THREE.Vector3(), _o = new THREE.Vector3();
  const invs = new Map();
  function write() {
    // a normal per grid point (across × down), pointing the way `out` points on the holder
    _o.copy(out).transformDirection(holder.matrixWorld);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const i = r * C + c;
      P(r * C + Math.min(C - 1, c + 1), _e1).sub(P(r * C + Math.max(0, c - 1), _p));
      P(Math.min(R - 1, r + 1) * C + c, _e2).sub(P(Math.max(0, r - 1) * C + c, _p));
      _n.crossVectors(_e2, _e1).normalize(); if (_n.dot(_o) < 0) _n.negate();
      nrm[i * 3] = _n.x; nrm[i * 3 + 1] = _n.y; nrm[i * 3 + 2] = _n.z;
    }
    for (const m of meshes) { if (!invs.has(m)) invs.set(m, new THREE.Matrix4()); invs.get(m).copy(m.matrixWorld).invert(); }
    for (const v of verts) {
      const k = v.r * C + v.c, ks = [k, k + 1, k + C, k + C + 1], ws = [(1 - v.u) * (1 - v.w), v.u * (1 - v.w), (1 - v.u) * v.w, v.u * v.w];
      let x = 0, y = 0, z = 0, nx = 0, ny = 0, nz = 0;
      for (let j = 0; j < 4; j++) { const q = ks[j] * 3, w = ws[j]; x += V.p[q] * w; y += V.p[q + 1] * w; z += V.p[q + 2] * w; nx += nrm[q] * w; ny += nrm[q + 1] * w; nz += nrm[q + 2] * w; }
      const inv = invs.get(v.m);
      _p.set(x + nx * v.off, y + ny * v.off, z + nz * v.off).applyMatrix4(inv);
      v.m.geometry.attributes.position.setXYZ(v.i, _p.x, _p.y, _p.z);
      // the grid's own normal (no per-frame normal rebuild); the back face keeps the file's sign
      _n.set(nx, ny, nz).transformDirection(inv); if (v.flip) _n.negate();
      v.m.geometry.attributes.normal?.setXYZ(v.i, _n.x, _n.y, _n.z);
    }
    for (const m of meshes) { m.geometry.attributes.position.needsUpdate = true; if (m.geometry.attributes.normal) m.geometry.attributes.normal.needsUpdate = true; }
  }
  return {
    points: V, colliders: cols,
    update(dt) {
      tgt(); cols.update();
      if (o.oneSided) { _o.copy(out).transformDirection(holder.matrixWorld); V.side = [_o.x, _o.y, _o.z]; }
      V.step(dt, cols); write();
    },
    reset() { V.ready = false; },
    dispose() { for (const m of meshes) m.geometry.dispose(); },
  };
}
