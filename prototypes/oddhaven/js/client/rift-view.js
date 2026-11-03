// What a rift looks like (PLAN M9, budget 180 draws / 350k triangles). What is there comes from the sim: town.mirror.rifts, town.mirror.calls. This only draws it.
//   draw 1: one instanced quad, one shader: the tear, the shimmer on the ground while it is only signs, the warning circles under a blow.
//   draw 2: one instanced box: health bars, cordon tape and posts, what is left in the road after a bump, a little sparkle of finds.
//   monsters and lost pets: real Creatures from avatar-3d, folded to one or two draws each by compactCreature, built once at boot from a fixed pool.
// Nothing is created while a fight starts or ends: the pool exists first, and warm() compiles every program, so a rift never stalls the frame with a shader build.
//
//   const v = createRiftView({ THREE, scene, town, ground, tier, kinds, createCreature, compactCreature, onReady });  await v.build();  v.warm(renderer, camera)
//   v.update(dt, seconds, focus)   v.event(e)   v.stats
const POOL = { snagjaw: 5, mirelump: 2, flitterwick: 3, stonegrub: 2, gloamwarden: 1 }, PETS = { cat: { type: 'cat', size: 0.6 }, hound: { type: 'hound', size: 0.6 }, hen: { type: 'hen', size: 0.8 }, frog: { type: 'frog', size: 0.9 } };
const QUADS = 40, BOXES = 96, BAR_W = 1.4, RANGE = 150, HOVER = { flitterwick: 1.5, gloamwarden: 0.0 };
const TEAR = 0, GROUND = 1, WARN = 2;
const VERT = `
  attribute vec4 iPos;   // xyz, size
  attribute vec3 iData;  // kind, phase, strength
  uniform float uTime;
  varying vec2 vUv; varying float vKind; varying float vPhase; varying float vPow;
  void main() {
    vUv = uv; vKind = iData.x; vPhase = iData.y; vPow = iData.z;
    if (iData.x < 0.5) {         // the tear: stands up and turns to you
      vec4 mv = viewMatrix * vec4(iPos.xyz, 1.0);
      mv.xy += (uv - vec2(0.5, 0.0)) * vec2(iPos.w * 0.62, iPos.w * 1.15);
      gl_Position = projectionMatrix * mv;
    } else {                     // flat on the ground
      vec3 p = iPos.xyz + vec3((uv.x - 0.5) * iPos.w, 0.0, (uv.y - 0.5) * iPos.w);
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }
  }`;
const FRAG = `
  precision mediump float;
  uniform float uTime;
  varying vec2 vUv; varying float vKind; varying float vPhase; varying float vPow;
  float wob(vec2 p) { return sin(p.x * 2.3 + sin(p.y * 1.9 + uTime)) * sin(p.y * 2.7 - sin(p.x * 1.4 - uTime * 0.7)) * 0.5 + 0.5; }
  void main() {
    if (vKind < 0.5) {
      vec2 c = vec2((vUv.x - 0.5) * 2.0, vUv.y * 2.0 - 1.0);
      float w = (1.0 - c.y * c.y) * (0.34 + wob(vec2(c.y * 3.0, vPhase)) * 0.2), d = abs(c.x) / max(w, 0.001);
      if (d > 1.25) discard;
      float core = smoothstep(1.0, 0.1, d), rim = smoothstep(1.25, 0.95, d) * (1.0 - core);
      vec3 col = mix(vec3(0.05, 0.0, 0.14), vec3(0.42, 0.12, 0.9), wob(vec2(c.x * 4.0 + uTime, c.y * 5.0)) * 0.7) * core + vec3(0.55, 0.85, 1.0) * rim * 1.4;
      float a = max(core, rim) * vPow;
      gl_FragColor = vec4(col * a, a * 0.92);
      return;
    }
    vec2 c = vUv - 0.5; float r = length(c) * 2.0;
    if (r > 1.0) discard;
    if (vKind < 1.5) { float ring = smoothstep(0.86, 0.98, r) * (1.0 - smoothstep(0.98, 1.0, r)) + smoothstep(0.0, 1.0, wob(c * 9.0)) * 0.22 * (1.0 - r); vec3 col = vec3(0.45, 0.25, 0.95); float a = ring * vPow; gl_FragColor = vec4(col * a, a * 0.7); return; }
    float pulse = 0.55 + 0.45 * sin(uTime * 11.0); float ring = smoothstep(0.82, 0.96, r) + (1.0 - r) * 0.28 * pulse; float a = clamp(ring, 0.0, 1.0) * vPow; gl_FragColor = vec4(vec3(1.0, 0.25, 0.12) * a, a * 0.75);
  }`;

export function createRiftView({ THREE, scene, town, ground, tier, kinds, createCreature, compactCreature }) {
  const group = new THREE.Group(); group.name = 'rifts'; scene.add(group);
  const quad = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry(); geo.index = quad.index; geo.setAttribute('position', quad.getAttribute('position')); geo.setAttribute('uv', quad.getAttribute('uv'));
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(QUADS * 4), 4), iData = new THREE.InstancedBufferAttribute(new Float32Array(QUADS * 3), 3);
  iPos.setUsage(THREE.DynamicDrawUsage); iData.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('iPos', iPos); geo.setAttribute('iData', iData); geo.instanceCount = 0;
  const uTime = { value: 0 }, mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uTime }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
  const quads = new THREE.Mesh(geo, mat); quads.frustumCulled = false; group.add(quads);
  const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), BOXES);
  boxes.frustumCulled = false; boxes.count = 0; boxes.instanceMatrix.setUsage(THREE.DynamicDrawUsage); boxes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BOXES * 3).fill(1), 3); boxes.instanceColor.setUsage(THREE.DynamicDrawUsage); group.add(boxes);
  const m4 = new THREE.Matrix4(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), q4 = new THREE.Quaternion(), yUp = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const slots = [], pets = new Map(), byMon = new Map(), dying = [];
  const self = {
    ready: false, stats: { monsters: 0, quads: 0, boxes: 0 }, lastBlow: null,
    /** The pool. Slices itself so the boot screen stays alive. */
    async build(breathe = async () => {}) {
      const detail = tier === 'high' ? 0.8 : 0.5;
      for (const [k, n] of Object.entries(POOL)) {
        for (let i = 0; i < n; i++) {
          const a = await createCreature({ ...kinds[k].look, seed: i * 17 + 3 }, { detail }); a.compacted = compactCreature(a); a.group.visible = false; a.group.traverse(o => { o.frustumCulled = false; }); group.add(a.group); a.setAnim('idle');
          slots.push({ k, a, m: -1, x: 0, z: 0, yaw: 0, y: 0 });
          await breathe();
        }
      }
      for (const [k, look] of Object.entries(PETS)) { const a = await createCreature(look, { detail }); a.compacted = compactCreature(a); a.group.visible = false; group.add(a.group); pets.set(k, a); await breathe(); }
      self.ready = true;
    },
    warm(renderer, camera) { for (const s of slots) s.a.group.visible = true; for (const a of pets.values()) a.group.visible = true; geo.instanceCount = 1; renderer.compile(scene, camera); for (const s of slots) s.a.group.visible = false; for (const a of pets.values()) a.group.visible = false; geo.instanceCount = 0; },
    event(e) { if (e.kind === 'fight.kill') { const s = byMon.get(`${e.rift}/${e.m}`); if (s) { s.a.setAnim('dead'); s.dying = 1.1; dying.push(s); byMon.delete(`${e.rift}/${e.m}`); } } else if (e.kind === 'fight.blow') self.lastBlow = e; },
    update(dt, seconds, focus, you = null) {
      uTime.value = seconds;
      const rifts = town.mirror.rifts ?? [], calls = town.mirror.calls ?? [];
      let nq = 0, nb = 0, live = 0;
      const q = (x, y, z, size, kind, phase, pow) => { if (nq >= QUADS) return; iPos.setXYZW(nq, x, y, z, size); iData.setXYZ(nq, kind, phase, pow); nq++; };
      const box = (x, y, z, w, h, d, c, yaw = 0) => { if (nb >= BOXES) return; q4.setFromAxisAngle(yUp, yaw); m4.compose(v3.set(x, y, z), q4, s3.set(w, h, d)); boxes.setMatrixAt(nb, m4); boxes.setColorAt(nb, col.set(c)); nb++; };
      const want = new Set();
      for (const R of rifts) {
        if (Math.hypot(R.x - focus.x, R.z - focus.z) > RANGE * 2) continue;
        const y = ground(R.x, R.z);
        q(R.x, y + 0.08, R.z, R.st === 'signs' ? 16 : 26, GROUND, R.id, R.st === 'signs' ? 0.55 : 0.9);
        if (R.st !== 'signs') q(R.x, y, R.z, R.size === 'big' ? 9 : 6.5, TEAR, R.id, R.st === 'seal' ? 1 - Math.min(0.75, R.seal / 3 * 0.75) : 1);
        for (const M of R.M) {
          const [i, k, x, z, hp, st, ax, az] = M, key = `${R.id}/${i}`;
          want.add(key);
          let s = byMon.get(key);
          if (!s) { s = slots.find(o => o.k === k && o.m < 0 && !o.dying); if (!s) continue; s.m = 1; s.x = x; s.z = z; s.yaw = 0; byMon.set(key, s); s.a.group.visible = true; s.a.setAnim('idle'); }
          const dx = x - s.x, dz = z - s.z, d = Math.hypot(dx, dz), step = Math.min(1, dt * 9);
          s.x += dx * step; s.z += dz * step;
          const speed = d / 0.25;
          if (d > 0.03) { const aim = Math.atan2(dx, dz); s.yaw += Math.atan2(Math.sin(aim - s.yaw), Math.cos(aim - s.yaw)) * Math.min(1, dt * 10); }
          if (st === 1) { const aim = Math.atan2(ax - s.x, az - s.z); s.yaw = aim; s.a.setAnim('attack'); q(ax, ground(ax, az) + 0.1, az, k === 'flitterwick' ? 3.4 : 4.2, WARN, i, 0.85); } else s.a.setAnim(speed > 0.4 ? 'walk' : 'idle');
          s.y = ground(s.x, s.z) + (HOVER[k] ?? 0);
          s.a.group.position.set(s.x, s.y, s.z); s.a.group.rotation.y = s.yaw;
          if (Math.hypot(s.x - focus.x, s.z - focus.z) < RANGE) s.a.update(dt, seconds);
          live++;
          const top = s.y + (kinds[k].boss ? 3.1 : k === 'mirelump' ? 1.9 : 1.5), w = BAR_W * (kinds[k].boss ? 1.8 : 1);
          box(s.x, top, s.z, w, 0.09, 0.09, '#2a1a2a');
          if (hp > 0) box(s.x - w * (1 - hp / 100) / 2, top + 0.02, s.z, w * hp / 100, 0.11, 0.11, kinds[k].boss ? '#ffb347' : '#ff5a4a');
        }
      }
      for (const [key, s] of byMon) if (!want.has(key)) { s.m = -1; s.a.group.visible = false; byMon.delete(key); }
      for (let i = dying.length - 1; i >= 0; i--) { const s = dying[i]; s.dying -= dt; s.a.update(dt, seconds); if (s.dying <= 0) { s.dying = 0; s.m = -1; s.a.group.visible = false; dying.splice(i, 1); } }
      // the law's bits of street furniture: tape round a fire, what is left of a bump, and someone's cat
      const seen = new Set();
      for (const C of calls) {
        if (Math.hypot(C.x - focus.x, C.z - focus.z) > RANGE) continue;
        if (C.k === 'cordon') { const r = 9, y0 = ground(C.x, C.z); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.6, x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r, x2 = C.x + Math.cos(a + Math.PI / 2) * r, z2 = C.z + Math.sin(a + Math.PI / 2) * r, y = ground(x, z); box(x, y + 0.5, z, 0.12, 1, 0.12, '#222a33'); box((x + x2) / 2, y0 + 0.92, (z + z2) / 2, Math.hypot(x2 - x, z2 - z), 0.05, 0.03, '#f2c230', -Math.atan2(z2 - z, x2 - x)); } }
        if (C.k === 'fender') for (let k = 0; k < 5; k++) { const a = k * 2.4 + C.id, x = C.x + Math.cos(a) * (1 + k * 0.5), z = C.z + Math.sin(a) * (1 + k * 0.4); box(x, ground(x, z) + 0.06, z, 0.5, 0.1, 0.32, k % 2 ? '#cfd6dc' : '#c2493d', a); }
        if (C.pet) {
          const a = pets.get(C.pet.kind); if (!a) continue;
          seen.add(C.pet.kind); a.group.visible = true;
          const carried = C.step !== 'pick' && you;
          if (carried) { a.group.position.set(you.x, you.y + 1.1, you.z); a.setAnim('idle'); } else { a.group.position.set(C.pet.x, ground(C.pet.x, C.pet.z), C.pet.z); a.setAnim('idle'); a.group.rotation.y = seconds * 0.3; }
          a.update(dt, seconds);
        }
      }
      for (const [k, a] of pets) if (!seen.has(k) && a.group.visible) a.group.visible = false;
      geo.instanceCount = nq; iPos.needsUpdate = true; iData.needsUpdate = true;
      boxes.count = nb; boxes.instanceMatrix.needsUpdate = true; if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true;
      quads.visible = nq > 0; boxes.visible = nb > 0;
      self.stats.monsters = live; self.stats.quads = nq; self.stats.boxes = nb;
    },
    state: () => ({ ready: self.ready, slots: slots.length, ...self.stats }),
  };
  return self;
}
