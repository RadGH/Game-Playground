// A fire you can see, in two draws however big it is (PLAN M5, budget 180 draws / 350k triangles). What burns comes from the sim's rooms, in
// town.mirror.fires; this only turns those numbers into pictures.
//   draw 1: one instanced quad, one shader: flames, smoke, sparks and water. The motion is in the vertex shader, so a fire costs the CPU one
//           rewrite a second. Premultiplied blending, so a flame adds light and smoke covers it in the same draw.
//   draw 2: one instanced box: hydrants, hose, jammed doors, scorch marks on the outside walls, the blue lights on an engine.
// Nothing is created or thrown away as a fire starts or ends: both pools exist from boot, and warm() compiles their programs there, so a fire
// never stalls the frame with a shader build (the memory note on recompiles is why).
//
//   const v = createFireView({ THREE, scene, world, town, plans, ground, tier });  v.warm(renderer, camera)
//   v.update(dt, seconds, focus, openLv, streams)   v.stats
import { toWorld, FLOOR_H, WALL_H } from '../sim/interior.js';

const CAPS = { low: { fx: 150, flames: 3, smoke: 2 }, high: { fx: 360, flames: 6, smoke: 4 } }, PROPS = 240, RANGE = 340, HYDRANT_RANGE = 120;
const FLAME = 0, SMOKE = 1, SPARK = 2, WATER = 3, SIGN_PAINT = ['#f4e9c8', '#e6b84a', '#f0d0c0', '#d8e0d0', '#e8c8d8', '#f2f2e6', '#e0cfa8'];
const fract = v => v - Math.floor(v);
const hash = (a, b) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);

const VERT = `
  attribute vec4 iPos;    // xyz, size
  attribute vec4 iMove;   // where it goes over a life, life in seconds
  attribute vec3 iData;   // kind, phase, heat
  uniform float uTime;
  varying vec2 vUv; varying float vU; varying float vKind; varying float vHeat; varying float vSeed; varying float vNear;
  void main() {
    float u = fract(uTime / iMove.w + iData.y);
    vec3 p = iPos.xyz + iMove.xyz * u;
    float k = iData.x, size = iPos.w;
    if (k < 0.5) { size *= 1.0 - u * 0.6; p.x += sin(uTime * 7.0 + iData.y * 40.0) * 0.08; }
    else if (k < 1.5) { size *= 0.5 + u * 1.6; p.x += sin(uTime * 0.7 + iData.y * 20.0) * u * 0.7; }
    else if (k > 2.5) { p.y += 4.0 * u * (1.0 - u) * 1.6; size *= 0.7 + u; }
    vec4 mv = viewMatrix * vec4(p, 1.0);
    // a flame is a tongue, not a ball: taller than wide, standing on its base. Close to, a quad would fill the screen, so anything that near thins out instead
    if (k < 0.5) { mv.x += (uv.x - 0.5) * size * 0.8; mv.y += uv.y * size * 1.5 - size * 0.25; } else mv.xy += (uv - 0.5) * size;
    vUv = uv; vU = u; vKind = k; vHeat = iData.z; vSeed = iData.y * 17.0 + uTime * (k < 0.5 ? 2.2 : 0.35);
    vNear = clamp((-mv.z - 0.8) / 3.2, 0.0, 1.0);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = `
  precision mediump float;
  varying vec2 vUv; varying float vU; varying float vKind; varying float vHeat; varying float vSeed; varying float vNear;
  float wob(vec2 p) { return sin(p.x * 2.1 + sin(p.y * 1.7)) * sin(p.y * 2.9 + sin(p.x * 1.3)) * 0.5 + 0.5; }
  float clouds(vec2 p) { return wob(p) * 0.6 + wob(p * 2.3 + 4.0) * 0.3 + wob(p * 4.7 + 9.0) * 0.1; }
  void main() {
    if (vKind < 0.5) {            // a tongue of flame: narrow at the tip, licked sideways as it rises, white-hot low down, red at the edges. Adds light
      float y = vUv.y, x = (vUv.x - 0.5) * 2.0;
      x += (clouds(vec2(vUv.x * 2.0 + vSeed * 0.3, y * 3.0 - vSeed)) - 0.5) * (0.25 + y * 0.9);
      float width = (1.0 - y) * (1.0 - y * 0.35) * smoothstep(0.0, 0.12, y) * 1.05;
      float body = 1.0 - abs(x) / max(width, 0.001);
      body += (clouds(vec2(vUv.x * 5.0, y * 5.0 - vSeed * 1.6)) - 0.5) * 0.5 * y;
      if (body <= 0.0) discard;
      float a = smoothstep(0.0, 0.32, body) * (1.0 - vU * vU), heat = smoothstep(0.1, 0.95, body * (1.05 - y * 0.75) * (1.0 - vU * 0.5));
      vec3 col = mix(vec3(0.72, 0.1, 0.02), vec3(1.0, 0.45, 0.06), smoothstep(0.0, 0.45, heat));
      col = mix(col, vec3(1.0, 0.9, 0.55), smoothstep(0.55, 1.0, heat));
      a *= vNear;
      gl_FragColor = vec4(col * a * (0.72 + vHeat * 0.5), a * 0.3);
      return;
    }
    vec2 c = vUv - 0.5; float r = length(c) * 2.0;
    if (r > 1.0) discard;
    float soft = 1.0 - r;
    if (vKind < 1.5) {            // smoke covers what is behind it: torn edges, thin close to
      float n = clouds(c * 4.0 + vSeed), a = smoothstep(0.0, 0.75, soft + (n - 0.55) * 0.75) * (1.0 - vU) * 0.55 * vHeat * vNear;
      gl_FragColor = vec4(mix(vec3(0.1, 0.095, 0.09), vec3(0.26, 0.25, 0.24), n) * a, a);
    } else if (vKind < 2.5) {     // a spark
      float a = smoothstep(0.5, 1.0, soft) * (1.0 - vU);
      gl_FragColor = vec4(mix(vec3(0.72, 0.6, 1.0), vec3(1.0, 0.62, 0.2), vHeat) * a, 0.0);      // heat 0 = magic, lilac; 1 = a spark off a fire
    } else {                      // water
      float a = soft * (1.0 - vU * 0.6) * 0.8;
      gl_FragColor = vec4(vec3(0.72, 0.86, 0.98) * a, a);
    }
  }`;

export function createFireView({ THREE, scene, world, town, plans, ground, tier = 'low' }) {
  const group = new THREE.Group(); group.name = 'fire'; scene.add(group);
  let C = CAPS[tier];
  const CAP = CAPS.high.fx;
  // ---- the one quad
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index; geo.setAttribute('position', quad.attributes.position); geo.setAttribute('uv', quad.attributes.uv);
  const attr = n => { const a = new THREE.InstancedBufferAttribute(new Float32Array(CAP * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
  const iPos = attr(4), iMove = attr(4), iData = attr(3);
  geo.setAttribute('iPos', iPos); geo.setAttribute('iMove', iMove); geo.setAttribute('iData', iData); geo.instanceCount = 0;
  const uTime = { value: 0 };
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uTime }, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation, premultipliedAlpha: true });
  const fx = new THREE.Mesh(geo, mat); fx.frustumCulled = false; fx.renderOrder = 6; fx.name = 'fire-fx'; group.add(fx);
  // ---- the one box
  const props = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: '#ffffff' }), PROPS);
  props.frustumCulled = false; props.count = 0; props.name = 'fire-props';
  props.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PROPS * 3).fill(1), 3); props.instanceColor.setUsage(THREE.DynamicDrawUsage); props.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(props);
  const buildings = new Map(world.buildings.map(b => [b.id, b])), hydrants = world.hydrants ?? [];
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color(), tmp = {};
  let np = 0, nf = 0, stream0 = 0, last = '', clock = 1, seen = -1;
  const box = (x, y, z, sx, sy, sz, yaw, hex) => { if (np >= PROPS) return; m4.compose(p3.set(x, y, z), q4.setFromAxisAngle(Y, yaw), s3.set(sx, sy, sz)); props.setMatrixAt(np, m4); props.setColorAt(np, col.set(hex)); np++; };
  const line = (ax, az, bx, bz, hex, w = 0.1) => { const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.2) return; const yaw = Math.atan2(dx, dz), mx = (ax + bx) / 2, mz = (az + bz) / 2; box(mx, ground(mx, mz) + 0.04, mz, w, 0.06, L, yaw, hex); };
  const put = (x, y, z, size, mx, my, mz, life, kind, phase, heat) => { if (nf >= CAP) return; iPos.setXYZW(nf, x, y, z, size); iMove.setXYZW(nf, mx, my, mz, life); iData.setXYZ(nf, kind, phase, heat); nf++; };

  /** A fire's rooms: flames on the floor and at the outside walls, smoke up through the roof. */
  function drawFire(F, openLv) {
    const b = buildings.get(F.b), plan = plans(F.b); if (!b || !plan) return;
    const fr = { cx: b.x, cz: b.z, yaw: b.yaw }, open = openLv.get(F.b) ?? null, roofY = b.y + (plan.levels) * FLOOR_H + 0.5;
    let plume = 0;
    for (const [id, h, sm] of F.rooms) {
      const r = plan.rooms.find(q => q.id === id); if (!r) continue;
      const base = b.y + r.lv * FLOOR_H + 0.12, seed = r.x0 * 3.1 + r.z0 * 5.7 + r.lv;
      plume = Math.max(plume, sm, h);
      if (open !== null && r.lv > open) continue;
      if (h > 0) {
        const n = Math.ceil(C.flames * Math.min(1, h + 0.2));
        for (let i = 0; i < n; i++) {
          const u = hash(seed, i), v = hash(seed + 7, i), lx = r.x0 + 0.5 + (r.x1 - r.x0 - 1) * u, lz = r.z0 + 0.5 + (r.z1 - r.z0 - 1) * v;
          toWorld(fr, lx, lz, tmp);
          put(tmp.x, base + 0.3, tmp.z, 1.5 + h * 1.5, 0, 1.7 + h * 1.6, 0, 0.8 + u * 0.5, FLAME, u, h);
        }
        // through the windows: the outside walls of a burning room, on the street's side of the shell
        const w = plan.w / 2, d = plan.d / 2, edge = [[r.x0 < -w + 0.4, r.x0 - 0.3, (r.z0 + r.z1) / 2], [r.x1 > w - 0.4, r.x1 + 0.3, (r.z0 + r.z1) / 2], [r.z0 < -d + 0.4, (r.x0 + r.x1) / 2, r.z0 - 0.3], [r.z1 > d - 0.4, (r.x0 + r.x1) / 2, r.z1 + 0.3]];
        for (const [on, ex, ez] of edge) { if (!on || h < 0.3) continue; toWorld(fr, ex, ez, tmp); put(tmp.x, base + 1.1, tmp.z, 1.6 + h, 0, 2 + h, 0, 0.9, FLAME, hash(seed, ex), h); put(tmp.x, base + 1.4, tmp.z, 2.4, 0, 6, 0, 3.4, SMOKE, hash(ez, seed), Math.min(1, h + 0.4)); }
        // through the roof, once the top floor has really caught
        if (r.lv === plan.levels - 1 && h > 0.5) { toWorld(fr, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, tmp); put(tmp.x, roofY - 0.2, tmp.z, 3.2, 0, 3.2, 0, 1, FLAME, hash(seed, 21), h); put(tmp.x + 0.8, roofY - 0.2, tmp.z - 0.6, 2.6, 0, 2.6, 0, 0.8, FLAME, hash(seed, 22), h); }
        if (i0(tier)) put(b.x + hash(seed, 3) * 4 - 2, base + 1.5, b.z + hash(seed, 5) * 4 - 2, 0.16, hash(seed, 9) * 3 - 1.5, 6, hash(seed, 11) * 3 - 1.5, 1.8, SPARK, hash(seed, 2), 1);
      }
      if (sm > 0.15) for (let i = 0; i < C.smoke; i++) { toWorld(fr, (r.x0 + r.x1) / 2 + (hash(seed, i) - 0.5) * 2, (r.z0 + r.z1) / 2 + (hash(seed, i + 9) - 0.5) * 2, tmp); put(tmp.x, base + 1.7, tmp.z, 2.2, 0.4, 1, 0.3, 3 + hash(seed, i), SMOKE, hash(i, seed), sm * 0.6); }
    }
    if (plume > 0.1) for (let i = 0; i < C.smoke * 3; i++) put(b.x + (hash(F.id, i) - 0.5) * plan.w * 0.6, roofY, b.z + (hash(i, F.id) - 0.5) * plan.d * 0.6, 4.5, 3, 14, 1.5, 4.5 + hash(i, 3), SMOKE, hash(i, 7), plume);
  }
  const i0 = t => t === 'high';
  function drawStatic(focus, openLv) {
    np = 0;
    for (const q of hydrants) { const dx = q[0] - focus.x, dz = q[1] - focus.z; if (dx * dx + dz * dz > HYDRANT_RANGE * HYDRANT_RANGE) continue; const y = ground(q[0], q[1]); box(q[0], y, q[1], 0.26, 0.62, 0.26, 0, '#c8362c'); box(q[0], y + 0.62, q[1], 0.34, 0.1, 0.34, 0, '#e0b93c'); box(q[0], y + 0.34, q[1], 0.46, 0.11, 0.11, 0, '#a22a22'); }
    // what a fire has done to the outside of a building, until it is mended
    for (const [id, row] of Object.entries(town.mirror.burnt ?? {})) {
      const b = buildings.get(id), plan = plans(id); if (!b || !plan || openLv.has(id)) continue;      // open, the burn is on the walls themselves
      const dx = b.x - focus.x, dz = b.z - focus.z; if (dx * dx + dz * dz > RANGE * RANGE) continue;
      const fr = { cx: b.x, cz: b.z, yaw: b.yaw }, w = plan.w / 2, d = plan.d / 2;
      for (const [rid, burn] of Object.entries(row.r)) {
        const r = plan.rooms.find(q => q.id === rid); if (!r || burn < 0.2) continue;
        const y = b.y + r.lv * FLOOR_H + 0.25, h = WALL_H * Math.min(1, 0.4 + burn * 0.7), hex = burn > 0.5 ? '#17130f' : '#3a322a';
        if (r.z1 > d - 0.4) { toWorld(fr, (r.x0 + r.x1) / 2, d + 0.06, tmp); box(tmp.x, y, tmp.z, (r.x1 - r.x0) * 0.86, h, 0.08, b.yaw, hex); }
        if (r.z0 < -d + 0.4) { toWorld(fr, (r.x0 + r.x1) / 2, -d - 0.06, tmp); box(tmp.x, y, tmp.z, (r.x1 - r.x0) * 0.86, h, 0.08, b.yaw, hex); }
        if (r.x0 < -w + 0.4) { toWorld(fr, -w - 0.06, (r.z0 + r.z1) / 2, tmp); box(tmp.x, y, tmp.z, 0.08, h, (r.z1 - r.z0) * 0.86, b.yaw, hex); }
        if (r.x1 > w - 0.4) { toWorld(fr, w + 0.06, (r.z0 + r.z1) / 2, tmp); box(tmp.x, y, tmp.z, 0.08, h, (r.z1 - r.z0) * 0.86, b.yaw, hex); }
      }
    }
    // a feud you can see from the road: a hand-painted sign on a post in the front yard
    for (const [place, kind] of town.mirror.signs ?? []) {
      const pl = town.roster?.places[place], b = pl && buildings.get(pl.building); if (!b) continue;
      const dx = b.x - focus.x, dz = b.z - focus.z; if (dx * dx + dz * dz > RANGE * RANGE) continue;
      const s = Math.sin(b.yaw), c = Math.cos(b.yaw), along = (kind % 3 - 1) * (b.w * 0.2), out = b.d / 2 + 1.6, x = b.x + along * c + out * s, z = b.z - along * s + out * c, y = ground(x, z);
      box(x, y, z, 0.1, 1.3, 0.1, b.yaw, '#6a4a2c');
      box(x, y + 0.95, z, 1.25, 0.72, 0.07, b.yaw, SIGN_PAINT[kind % SIGN_PAINT.length]);
      box(x, y + 1.14, z + 0.02, 0.92, 0.07, 0.08, b.yaw, '#1c2730'); box(x, y + 1.0, z + 0.02, 0.7, 0.07, 0.08, b.yaw, '#1c2730');
    }
    for (const F of town.mirror.fires ?? []) {
      const b = buildings.get(F.b), plan = plans(F.b); if (!b || !plan) continue;
      const fr = { cx: b.x, cz: b.z, yaw: b.yaw };
      for (const id of F.jam) {         // boards and warped metal across a door someone will have to break
        const d = plan.doors.find(q => q.id === id); if (!d) continue;
        toWorld(fr, d.x, d.z, tmp);
        const y = b.y + d.lv * FLOOR_H, yaw = d.axis === 'x' ? b.yaw : b.yaw + Math.PI / 2, hits = F.hits?.[id] ?? 0;
        box(tmp.x, y + 0.02, tmp.z, d.w, d.h, 0.14, yaw, hits ? '#5a4632' : '#3f3a36');
        for (let i = 0; i < 2; i++) box(tmp.x, y + 0.75 + i * 0.8, tmp.z + 0.1, d.w + 0.3, 0.14, 0.09, yaw, '#b5482e');
      }
      const c = F.call; if (!c || c.st !== 'scene') continue;
      const hold = c.hose >= 0 ? town.handsPos?.(c.hose) ?? town.mirror.people.get(c.hose) : null;
      if (c.hooked && c.hydrant) line(c.hydrant[0], c.hydrant[1], c.spot.x, c.spot.z, '#d8c21e');
      if (hold?.x != null) { const mx = (c.spot.x + hold.x) / 2 + 0.8, mz = (c.spot.z + hold.z) / 2 - 0.8; line(c.spot.x, c.spot.z, mx, mz, '#d8c21e'); line(mx, mz, hold.x, hold.z, '#d8c21e'); }
    }
  }
  /** Water: one stream a hose. Rewritten as it moves, a few quads only. */
  function drawStreams(list, magic = []) {
    nf = stream0;
    for (const m of magic) for (let i = 0; i < 10; i++) put(m.x + Math.sin(i * 2.4) * 0.55, m.y + 0.4, m.z + Math.cos(i * 2.4) * 0.55, 0.3, Math.sin(i * 2.4) * 0.5, 1.6, Math.cos(i * 2.4) * 0.5, 0.9, SPARK, i / 10, 0);
    const low = tier === 'low' ? 8 : 14;
    for (const s of list) for (let i = 0; i < low; i++) put(s.x, s.y, s.z, 0.62, s.tx - s.x, s.ty - s.y, s.tz - s.z, 0.75, WATER, i / low, 1);
    iPos.addUpdateRange?.(0, 0); iPos.needsUpdate = true; iMove.needsUpdate = true; iData.needsUpdate = true;
    geo.instanceCount = nf;
  }
  /** Blue lights on anything with a siren, one rewrite a frame while there is one. */
  function lights(list, seconds) {
    for (const c of list) {
      const on = Math.floor(seconds * 3) % 2 === 0, y = c.y + 2.5, s = Math.sin(c.yaw), k = Math.cos(c.yaw);
      box(c.x + k * 0.5 + s * 0.6, y, c.z - s * 0.5 + k * 0.6, 0.4, 0.16, 0.26, c.yaw, on ? '#3f8cff' : '#123060');
      box(c.x - k * 0.5 + s * 0.6, y, c.z + s * 0.5 + k * 0.6, 0.4, 0.16, 0.26, c.yaw, on ? '#123060' : '#ff4040');
    }
  }
  const self = {
    group, stats: { flames: 0, quads: 0, props: 0, fires: 0 }, lastLights: [],
    setTier(t) { tier = t; C = CAPS[t]; last = ''; },
    /** Build every program in the scene at boot, hidden pools included, with a quad in ours, so the first fire of a game does not hitch. */
    warm(renderer, camera) { const tool = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshLambertMaterial({ color: '#888888' })); tool.visible = false; group.add(tool);        /* the axe a crew member breaks a door with is a plain mesh, made on first swing: this builds its program now */
      put(0, -50, 0, 1, 0, 0, 0, 1, SMOKE, 0, 0); geo.instanceCount = 1; props.count = 1; const hidden = []; scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } }); try { renderer.compile(scene, camera); } catch { /* it will compile on first use */ } for (const o of hidden) o.visible = false; geo.instanceCount = 0; props.count = 0; nf = 0; },
    update(dt, seconds, focus, openLv, streams, sirens, magic = []) {
      uTime.value = seconds;
      const fires = (town.mirror.fires ?? []).filter(F => { const b = buildings.get(F.b); return b && (b.x - focus.x) ** 2 + (b.z - focus.z) ** 2 < RANGE * RANGE; });
      const key = `${town.mirror.t >> 3}|${[...openLv].join()}|${fires.length}`;
      clock += dt;
      if (key !== last || clock > 1) {
        last = key; clock = 0;
        nf = 0;
        for (const F of fires) drawFire(F, openLv);
        stream0 = nf;
        drawStatic(focus, openLv);
        seen = np;
        self.stats.flames = nf; self.stats.fires = fires.length;
      }
      np = seen;
      lights(sirens, seconds); self.lastLights = sirens.map(q => ({ x: q.x, z: q.z }));
      if (streams.length || magic.length || nf !== stream0 || key === last) drawStreams(streams, magic);
      props.count = np; props.instanceMatrix.needsUpdate = true; if (props.instanceColor) props.instanceColor.needsUpdate = true;
      props.visible = np > 0; fx.visible = nf > 0;
      self.stats.quads = nf; self.stats.props = np;
    },
  };
  return self;
}
