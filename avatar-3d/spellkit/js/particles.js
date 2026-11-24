// Spell Kit particles: two shared pools (glowing = additive, smoky = normal blending), each ONE instanced draw for
// every particle of every effect. The CPU moves them (a few thousand is cheap) and writes the instance buffers once
// a frame. Emitters belong to effects; each has its own cap, and the kit's global budget refuses births when full.
import { PARTICLE_VS, PARTICLE_FS } from './shaders.js';

// one particle = STRIDE floats
const P = {
  x: 0, y: 1, z: 2, vx: 3, vy: 4, vz: 5, age: 6, life: 7, s0: 8, s1: 9, s2: 10, rot: 11, spin: 12, stretch: 13,
  cell: 14, frames: 15, fps: 16, drag: 17, grav: 18, a0: 19, a1: 20, a2: 21,
  c0: 22, c1: 25, c2: 28, e: 31, swirl: 34, ground: 35,
};
const STRIDE = 36;

export class ParticlePool {
  constructor(THREE, { capacity, atlas, cellsPerRow, blending, name }) {
    this.THREE = THREE; this.cap = capacity; this.n = 0;
    this.d = new Float32Array(capacity * STRIDE);
    this.owner = new Array(capacity).fill(null);     // emitter that made it (for its live count)
    this.anchor = new Array(capacity).fill(null);    // Vector3 it follows, or null (world space)
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (name, size) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
      a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a;
    };
    this.aPos = mk('iPos', 3); this.aVel = mk('iVel', 3); this.aSize = mk('iSize', 4); this.aCol = mk('iCol', 4); this.aEdge = mk('iEdge', 3);
    g.instanceCount = 0;
    this.geometry = g;
    this.material = new THREE.ShaderMaterial({
      name: 'spellkit-particles-' + name,
      vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS,
      uniforms: { uAtlas: { value: atlas }, uCells: { value: cellsPerRow } },
      transparent: true, depthWrite: false, blending,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'spellkit-particles-' + name;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = blending === THREE.AdditiveBlending ? 12 : 11;
    this.mesh.visible = false;
  }

  /** room for one more? */
  full() { return this.n >= this.cap; }

  spawn(o) {
    if (this.n >= this.cap) return -1;
    const i = this.n++, b = i * STRIDE, d = this.d;
    d[b + P.x] = o.x; d[b + P.y] = o.y; d[b + P.z] = o.z;
    d[b + P.vx] = o.vx; d[b + P.vy] = o.vy; d[b + P.vz] = o.vz;
    d[b + P.age] = 0; d[b + P.life] = o.life;
    d[b + P.s0] = o.s0; d[b + P.s1] = o.s1; d[b + P.s2] = o.s2;
    d[b + P.rot] = o.rot; d[b + P.spin] = o.spin; d[b + P.stretch] = o.stretch;
    d[b + P.cell] = o.cell; d[b + P.frames] = o.frames; d[b + P.fps] = o.fps;
    d[b + P.drag] = o.drag; d[b + P.grav] = o.grav;
    d[b + P.a0] = o.a[0]; d[b + P.a1] = o.a[1]; d[b + P.a2] = o.a[2];
    for (let k = 0; k < 3; k++) {
      d[b + P.c0 + k] = o.c[0][k]; d[b + P.c1 + k] = o.c[1][k]; d[b + P.c2 + k] = o.c[2][k]; d[b + P.e + k] = o.e[k];
    }
    d[b + P.swirl] = o.swirl; d[b + P.ground] = o.ground;
    this.owner[i] = o.owner; this.anchor[i] = o.anchor;
    if (o.owner) o.owner.live++;
    return i;
  }

  kill(i) {
    const last = --this.n, d = this.d;
    if (this.owner[i]) this.owner[i].live--;
    if (i !== last) {
      d.copyWithin(i * STRIDE, last * STRIDE, last * STRIDE + STRIDE);
      this.owner[i] = this.owner[last]; this.anchor[i] = this.anchor[last];
    }
    this.owner[last] = null; this.anchor[last] = null;
  }

  /** forget every particle an emitter made (used when its effect is killed outright) */
  killOwner(em) {
    for (let i = this.n - 1; i >= 0; i--) if (this.owner[i] === em) this.kill(i);
  }

  update(dt, heightAt) {
    const d = this.d;
    const pos = this.aPos.array, vel = this.aVel.array, size = this.aSize.array, col = this.aCol.array, edge = this.aEdge.array;
    for (let i = this.n - 1; i >= 0; i--) {
      const b = i * STRIDE;
      const age = (d[b + P.age] += dt), life = d[b + P.life];
      if (age >= life) { this.kill(i); continue; }
      // motion
      const drag = Math.max(0, 1 - d[b + P.drag] * dt);
      d[b + P.vx] *= drag; d[b + P.vz] *= drag; d[b + P.vy] = d[b + P.vy] * drag - d[b + P.grav] * dt;
      const sw = d[b + P.swirl];
      if (sw) {   // turn round the anchor's vertical axis (local x/z = offset from the centre for anchored ones)
        const a = sw * dt, cs = Math.cos(a), sn = Math.sin(a);
        const x = d[b + P.x], z = d[b + P.z];
        if (this.anchor[i]) { d[b + P.x] = x * cs - z * sn; d[b + P.z] = x * sn + z * cs; }
        const vx = d[b + P.vx], vz = d[b + P.vz];
        d[b + P.vx] = vx * cs - vz * sn; d[b + P.vz] = vx * sn + vz * cs;
      }
      d[b + P.x] += d[b + P.vx] * dt; d[b + P.y] += d[b + P.vy] * dt; d[b + P.z] += d[b + P.vz] * dt;
      d[b + P.rot] += d[b + P.spin] * dt;
      const an = this.anchor[i];
      let wx = d[b + P.x], wy = d[b + P.y], wz = d[b + P.z];
      if (an) { wx += an.x; wy += an.y; wz += an.z; }
      const g = d[b + P.ground];
      if (g > 0 && heightAt) {   // stays on the ground (dust, creeping cloud)
        const h = heightAt(wx, wz) + g * 0.5;
        if (wy < h) { if (an) d[b + P.y] += h - wy; else d[b + P.y] = h; wy = h; }
      }
      // curves: 3 stops at 0, 0.5, 1
      const t = age / life, k = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      const lo = t < 0.5 ? 0 : 1;
      const sA = d[b + P.s0 + lo], sB = d[b + P.s0 + lo + 1];
      const aA = d[b + P.a0 + lo], aB = d[b + P.a0 + lo + 1];
      const cA = b + (lo ? P.c1 : P.c0), cB = b + (lo ? P.c2 : P.c1);
      const j3 = i * 3, j4 = i * 4;
      pos[j3] = wx; pos[j3 + 1] = wy; pos[j3 + 2] = wz;
      vel[j3] = d[b + P.vx]; vel[j3 + 1] = d[b + P.vy]; vel[j3 + 2] = d[b + P.vz];
      const frames = d[b + P.frames], fps = d[b + P.fps];
      let f = 0;
      if (frames > 1) f = fps > 0 ? Math.floor(age * fps) % frames : Math.min(frames - 1, Math.floor(t * frames));
      size[j4] = sA + (sB - sA) * k; size[j4 + 1] = d[b + P.rot]; size[j4 + 2] = d[b + P.stretch]; size[j4 + 3] = d[b + P.cell] + f;
      col[j4] = d[cA] + (d[cB] - d[cA]) * k; col[j4 + 1] = d[cA + 1] + (d[cB + 1] - d[cA + 1]) * k; col[j4 + 2] = d[cA + 2] + (d[cB + 2] - d[cA + 2]) * k;
      col[j4 + 3] = aA + (aB - aA) * k;
      edge[j3] = d[b + P.e]; edge[j3 + 1] = d[b + P.e + 1]; edge[j3 + 2] = d[b + P.e + 2];
    }
    const n = this.n;
    this.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n) for (const a of [this.aPos, this.aVel, this.aSize, this.aCol, this.aEdge]) {
      a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true;
    }
  }

  clear() { for (let i = this.n - 1; i >= 0; i--) this.kill(i); this.geometry.instanceCount = 0; this.mesh.visible = false; }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

const rnd = (r) => Array.isArray(r) ? r[0] + Math.random() * (r[1] - r[0]) : (r ?? 0);

/**
 * An emitter: spawns particles from one anchor (a hand, a missile, the ground centre…). Layer fields (spell-visuals
 * JSON): tex | texs, blend, rate, burst, max, life, size, sizeCurve, color (1-3 stops), edge, alpha (3 stops),
 * shape (point|sphere|disc|ring|line|cylinder), radius|rad, height, dir (up|out|in|random|forward|down|outUp),
 * speed, spread, up, swirl, gravity, drag, spin, stretch, fps, follow, converge, onGround, duration, delay.
 */
export class Emitter {
  constructor(kit, fx, L, anchorFn) {
    this.kit = kit; this.fx = fx; this.L = L; this.anchorFn = anchorFn;
    this.pool = L.blend === 'normal' ? kit.pools.normal : kit.pools.add;
    this.live = 0; this.t = -(L.delay || 0); this.acc = 0;
    this.dur = L.duration ?? (fx.oneShot ? 0.05 : fx.phaseLength ?? Infinity);
    const q = kit.quality === 'low' ? 0.5 : 1;
    this.q = q;
    this.max = Math.max(1, Math.round((L.max ?? 160) * q * (fx.density ?? 1)));
    this.texs = (L.texs || [L.tex || 'dot_soft']).map(id => kit.tex.sprite(fx.subst(id)));
    this.colors = fx.colors(L.color || ['hot', 'mid', 'deep']);
    this.edge = fx.color(L.edge || 'deep');
    this.alpha = L.alpha || [0, 1, 0];
    this.pos = new kit.THREE.Vector3(); this.prev = new kit.THREE.Vector3(); this.hasPrev = false;
    this.anchorVec = L.follow ? new kit.THREE.Vector3() : null;
    this.burstDone = false; this.done = false; this.stopped = false;
  }

  stop() { this.stopped = true; }

  update(dt) {
    if (this.done) return;
    this.t += dt;
    if (this.t < 0) return;
    const L = this.L, fx = this.fx;
    const emitting = !this.stopped && (this.t <= this.dur || !this.burstDone);
    if (emitting || !this.hasPrev) {
      this.anchorFn(this.pos);
      if (this.anchorVec) this.anchorVec.copy(this.pos);
    }
    if (!this.hasPrev) { this.prev.copy(this.pos); this.hasPrev = true; }
    if (emitting) {
      let count = 0;
      if (!this.burstDone) { count += Math.round((L.burst || 0) * this.q * (fx.density ?? 1)); this.burstDone = true; }
      if (L.rate) {
        this.acc += L.rate * this.q * (fx.density ?? 1) * this.kit.pressure() * dt;
        const n = Math.floor(this.acc); this.acc -= n; count += n;
      }
      for (let k = 0; k < count && this.live < this.max; k++) this.emitOne(count > 1 ? k / count : 1);
    }
    this.prev.copy(this.pos);
    if ((this.stopped || this.t > this.dur) && this.live <= 0) this.done = true;
  }

  emitOne(frac) {
    const kit = this.kit, L = this.L, fx = this.fx;
    if (kit.overBudget()) return;
    const s = fx.scale;
    const R = (L.rad != null ? L.rad * fx.radius : (L.radius ?? 0) * s);
    // spawn point relative to the anchor
    let ox = 0, oy = 0, oz = 0, nx = 0, nz = 0;
    const shape = L.shape || 'point';
    const ang = Math.random() * Math.PI * 2;
    if (shape === 'sphere') {
      const u = Math.random() * 2 - 1, r = R * Math.cbrt(Math.random()), q = Math.sqrt(1 - u * u);
      ox = Math.cos(ang) * q * r; oy = u * r; oz = Math.sin(ang) * q * r;
      nx = Math.cos(ang); nz = Math.sin(ang);
    } else if (shape === 'disc' || shape === 'cylinder') {
      const r = R * Math.sqrt(Math.random());
      ox = Math.cos(ang) * r; oz = Math.sin(ang) * r; nx = Math.cos(ang); nz = Math.sin(ang);
      if (shape === 'cylinder') oy = Math.random() * (L.height ?? 1) * s;
    } else if (shape === 'ring') {
      const r = R * (1 + (Math.random() - 0.5) * (L.jitter ?? 0.1));
      ox = Math.cos(ang) * r; oz = Math.sin(ang) * r; nx = Math.cos(ang); nz = Math.sin(ang);
    } else if (shape === 'line') {   // along the effect's direction (line spells, walls)
      const len = (L.length != null ? L.length * s : fx.length), w = (L.width ?? 0.4) * s;
      const along = Math.random() * len, side = (Math.random() - 0.5) * w;
      ox = fx.dir.x * along - fx.dir.z * side; oz = fx.dir.z * along + fx.dir.x * side;
      nx = -fx.dir.z * Math.sign(side || 1); nz = fx.dir.x * Math.sign(side || 1);
    }
    if (L.offset) { ox += L.offset[0] * s; oy += L.offset[1] * s; oz += L.offset[2] * s; }
    // moving anchors spread their spawns along the frame's path, so a fast missile leaves a line, not dots
    const px = this.prev.x + (this.pos.x - this.prev.x) * frac, py = this.prev.y + (this.pos.y - this.prev.y) * frac, pz = this.prev.z + (this.pos.z - this.prev.z) * frac;
    let wx = px + ox, wy = py + oy, wz = pz + oz;
    if (L.onGround && kit.heightAt) wy = kit.heightAt(wx, wz) + (L.offset?.[1] ?? 0.05) * s;
    // velocity
    const sp = rnd(L.speed ?? 0) * s;
    let dx = 0, dy = 0, dz = 0;
    const dir = L.dir || 'random';
    if (dir === 'up') dy = 1;
    else if (dir === 'down') dy = -1;
    else if (dir === 'out') { dx = nx || Math.cos(ang); dz = nz || Math.sin(ang); }
    else if (dir === 'outUp') { dx = (nx || Math.cos(ang)) * 0.7; dz = (nz || Math.sin(ang)) * 0.7; dy = 0.7; }
    else if (dir === 'in') { dx = -(nx || Math.cos(ang)); dz = -(nz || Math.sin(ang)); }
    else if (dir === 'forward') { dx = fx.dir.x; dy = fx.dir.y; dz = fx.dir.z; }
    else if (dir === 'back') { dx = -fx.dir.x; dy = -fx.dir.y; dz = -fx.dir.z; }
    else { const u = Math.random() * 2 - 1, q = Math.sqrt(1 - u * u), a2 = Math.random() * Math.PI * 2; dx = Math.cos(a2) * q; dy = u; dz = Math.sin(a2) * q; }
    const spr = L.spread ?? 0.15;
    if (spr) {
      dx += (Math.random() * 2 - 1) * spr; dy += (Math.random() * 2 - 1) * spr; dz += (Math.random() * 2 - 1) * spr;
      const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    }
    let vx = dx * sp, vy = dy * sp + rnd(L.up ?? 0) * s, vz = dz * sp;
    const life = rnd(L.life ?? [0.5, 0.9]);
    if (L.converge) { vx = -(ox) / life * 0.95; vy = -(oy) / life * 0.95; vz = -(oz) / life * 0.95; }
    const size = rnd(L.size ?? [0.2, 0.3]) * s;
    const sc = L.sizeCurve || [1, 1, 1];
    const tex = this.texs[(Math.random() * this.texs.length) | 0];
    const follow = this.anchorVec;
    this.pool.spawn({
      x: follow ? wx - this.pos.x : wx, y: follow ? wy - this.pos.y : wy, z: follow ? wz - this.pos.z : wz,
      vx, vy, vz, life,
      s0: size * sc[0], s1: size * sc[1], s2: size * sc[2],
      rot: L.rot === 0 ? 0 : Math.random() * Math.PI * 2, spin: rnd(L.spin ?? 0) * (Math.random() < 0.5 ? -1 : 1),
      stretch: L.stretch ?? 0,
      cell: tex.cell, frames: tex.frames, fps: L.fps ?? -1,
      drag: L.drag ?? 0, grav: L.gravity ?? 0,
      a: this.alpha, c: this.colors, e: this.edge,
      swirl: L.swirl ?? 0, ground: L.onGround ? 1 : 0,
      owner: this, anchor: follow,
    });
  }

  free() { if (this.live > 0) this.pool.killOwner(this); this.done = true; }
}
