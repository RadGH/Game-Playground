// The ring: renderer, camera, the arena (sand floor, stone wall, two gates, stands with a crowd, torches, banners) and
// the effects pool (shots, warning circles, blasts, shouts, sparks). Effects are made once and reused — no lights are
// added or hidden and no materials disposed mid-fight (lessons rule 29).
import * as THREE from 'three';
import { ARENA_R } from '../sim/fight.js';

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const sky = skyTexture(); scene.background = sky;
  scene.fog = new THREE.Fog(0x2a1d22, 30, 70);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

  // light: a low warm evening sun, a cool sky fill, four torches
  scene.add(new THREE.HemisphereLight(0xbcc8ff, 0x5a3a24, 1.0));
  const sun = new THREE.DirectionalLight(0xffd6a0, 2.6);
  sun.position.set(-9, 16, 7); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
  scene.add(sun);

  const arena = buildArena(scene);
  const fx = createFx(scene);

  let w = 0, h = 0, quality = 1;
  function resize() {
    const cw = canvas.clientWidth, ch = canvas.clientHeight; if (!cw || !ch) return;
    if (cw === w && ch === h) return;
    w = cw; h = ch;
    renderer.setPixelRatio(Math.min(devicePixelRatio, quality >= 1 ? 2 : 1.25));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  // camera: a fixed southern view (W = screen north, lessons rule 26), easing toward a target point and distance
  const cam = { x: 0, z: 0, y: 0.9, dist: 15, want: { x: 0, z: 0, dist: 15, pitch: 0.82, y: 0.9 }, pitch: 0.82, shake: 0 };
  function placeCamera(dt) {
    const k = 1 - Math.exp(-dt * 4);
    cam.x += (cam.want.x - cam.x) * k; cam.z += (cam.want.z - cam.z) * k;
    cam.dist += (cam.want.dist - cam.dist) * k; cam.pitch += (cam.want.pitch - cam.pitch) * k; cam.y += ((cam.want.y ?? 0.9) - cam.y) * k;
    const portrait = h > w && !cam.want.flat && !api.focus;
    const d = cam.dist * (portrait ? 1.45 : 1);
    const sx = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake : 0, sy = cam.shake > 0 ? (Math.random() - 0.5) * cam.shake : 0;
    cam.shake = Math.max(0, cam.shake - dt * 2.5);
    camera.position.set(cam.x + sx, Math.sin(cam.pitch) * d + cam.y + sy, cam.z + Math.cos(cam.pitch) * d);
    camera.lookAt(cam.x, cam.y, cam.z - (portrait ? 0.6 : 0));
    // the pick screen centres the fighters in the open part of the screen, not behind the panel
    const f = api.focus;
    if (f) camera.setViewOffset(w, h, w / 2 - f.cx, h / 2 - f.cy, w, h);
    else if (camera.view && camera.view.enabled) camera.clearViewOffset();
  }

  const api = {
    focus: null,
    renderer, scene, camera, arena, fx, cam,
    setQuality(q) { quality = q; renderer.shadowMap.enabled = q >= 1; sun.castShadow = q >= 1; w = 0; resize(); scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); },
    render(dt, t) {
      resize(); placeCamera(dt);
      arena.update(dt, t); fx.update(dt);
      renderer.render(scene, camera);
    },
    resize,
    /** Screen position (CSS px) of a world point, or null when it is behind the camera. */
    toScreen(x, y, z) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      if (v.z > 1) return null;
      return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
    },
    get size() { return { w, h }; },
    /** Centre and size the camera so models `tallest` m high spread over `span` m fill the screen rectangle `r`. */
    frame(r, span, tallest, pitch = 0.22) {
      resize();
      const H = h || innerHeight, tan = Math.tan((camera.fov * Math.PI) / 360);
      const dV = (tallest * 1.3) / (2 * tan * (r.height / H)), dH = (span + 1.2) / (2 * tan * (r.width / H));
      api.focus = { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      return { x: 0, z: 0, dist: Math.max(dV, dH, 2.6), pitch, y: tallest * 0.5, flat: true };
    },
  };
  return api;
}

function skyTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#1b1530'); gr.addColorStop(0.45, '#5a3550'); gr.addColorStop(0.7, '#c46a4a'); gr.addColorStop(1, '#2a1d22');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function sandTexture() {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#b8935f'; g.fillRect(0, 0, S, S);
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 7000; i++) { const v = r(); g.fillStyle = v < 0.5 ? `rgba(90,60,30,${0.05 + r() * 0.08})` : `rgba(255,235,190,${0.04 + r() * 0.07})`; g.beginPath(); g.ellipse(r() * S, r() * S, 2 + r() * 9, 2 + r() * 5, r() * 3, 0, Math.PI * 2); g.fill(); }
  // soften the grain once (a blur on every small shape is far too slow)
  const soft = document.createElement('canvas'); soft.width = soft.height = S; const sg = soft.getContext('2d'); sg.filter = 'blur(1.5px)'; sg.drawImage(c, 0, 0); g.drawImage(soft, 0, 0);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(70,45,20,${0.12 + r() * 0.15})`; g.fillRect(r() * S, r() * S, 1.5, 1.5); }
  // raked rings and a painted circle in the middle
  g.strokeStyle = 'rgba(80,50,25,0.18)'; g.lineWidth = 3;
  for (let rr = 60; rr < S / 2; rr += 46) { g.beginPath(); g.arc(S / 2, S / 2, rr, 0, Math.PI * 2); g.stroke(); }
  g.strokeStyle = 'rgba(120,30,20,0.55)'; g.lineWidth = 10; g.beginPath(); g.arc(S / 2, S / 2, S * 0.16, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 5; g.beginPath(); g.arc(S / 2, S / 2, S * 0.135, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.beginPath(); g.moveTo(S / 2 + Math.cos(a) * S * 0.16, S / 2 + Math.sin(a) * S * 0.16); g.lineTo(S / 2 + Math.cos(a) * S * 0.2, S / 2 + Math.sin(a) * S * 0.2); g.stroke(); }
  // darker, scuffed edge near the wall
  const rad = g.createRadialGradient(S / 2, S / 2, S * 0.36, S / 2, S / 2, S * 0.5);
  rad.addColorStop(0, 'rgba(60,40,20,0)'); rad.addColorStop(1, 'rgba(60,40,20,0.45)'); g.fillStyle = rad; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function buildArena(scene) {
  const R = ARENA_R;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 1.2, 72), new THREE.MeshStandardMaterial({ map: sandTexture(), roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 32), new THREE.MeshStandardMaterial({ color: 0x3b2a22, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground);

  // the wall: stone blocks in a ring, two gates (north and south) left open with posts and a lintel
  const stone = new THREE.MeshStandardMaterial({ color: 0x8a7f74, roughness: 0.9 });
  const stoneDark = new THREE.MeshStandardMaterial({ color: 0x5f554d, roughness: 0.95 });
  const N = 64, blockG = new THREE.BoxGeometry(1.15, 1.5, 0.8);
  const gateAt = [Math.PI / 2, -Math.PI / 2];                 // angle 0 = +x; gates at +z (south, near the camera)… and −z
  const isGate = a => gateAt.some(g => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.1);
  const keep = []; for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; if (!isGate(a)) keep.push(a); }
  const wall = new THREE.InstancedMesh(blockG, stone, keep.length), cap = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.18, 0.95), stoneDark, keep.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  keep.forEach((a, i) => {
    const r = R + 0.55, x = Math.cos(a) * r, z = Math.sin(a) * r;
    q.setFromAxisAngle(up, -a + Math.PI / 2);
    sc.set(1, 0.92 + ((i * 37) % 10) / 60, 1);
    m4.compose(new THREE.Vector3(x, 0.75 * sc.y, z), q, sc); wall.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, 1.5 * sc.y + 0.08, z), q, new THREE.Vector3(1, 1, 1)); cap.setMatrixAt(i, m4);
  });
  wall.castShadow = wall.receiveShadow = true; cap.castShadow = true; scene.add(wall, cap);
  for (const g of gateAt) {
    for (const s of [-1, 1]) {
      const a = g + s * 0.13, r = R + 0.6;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.2, 0.9), stoneDark); post.position.set(Math.cos(a) * r, 1.6, Math.sin(a) * r); post.castShadow = true; scene.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.6, 0.9), stoneDark);
    lintel.position.set(Math.cos(g) * (R + 0.6), 3.3, Math.sin(g) * (R + 0.6)); lintel.rotation.y = -g + Math.PI / 2; lintel.castShadow = true; scene.add(lintel);
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.0), new THREE.MeshBasicMaterial({ color: 0x0c0806 }));
    dark.position.set(Math.cos(g) * (R + 1.2), 1.5, Math.sin(g) * (R + 1.2)); dark.lookAt(0, 1.5, 0); scene.add(dark);
  }

  // stands: three stepped rings behind the wall, with a crowd that bobs and cheers
  const step = new THREE.MeshStandardMaterial({ color: 0x6d6158, roughness: 0.95 });
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(R + 3.4 + i * 1.6, R + 3.4 + i * 1.6, 1.9 + i * 1.0, 64, 1, true), step);
    ring.material.side = THREE.DoubleSide; ring.position.y = (1.9 + i * 1.0) / 2; scene.add(ring);
    const top = new THREE.Mesh(new THREE.RingGeometry(R + 1.8 + i * 1.6, R + 3.4 + i * 1.6, 64), step);
    top.rotation.x = -Math.PI / 2; top.position.y = 1.9 + i * 1.0 - (i === 0 ? 0 : 0); scene.add(top);
  }
  const crowdG = new THREE.CylinderGeometry(0.17, 0.26, 0.62, 7);
  const crowdM = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const seats = [];
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 3; i++) {
    const r = R + 2.6 + i * 1.6, n = Math.floor(r * 3.4);
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + rnd() * 0.05;
      if (isGate(a) && i === 0) continue;
      if (rnd() < 0.18) continue;
      seats.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: 1.9 + i * 1.0 + 0.45, ph: rnd() * 6.28, sp: 1.5 + rnd() * 2.5 });
    }
  }
  const crowd = new THREE.InstancedMesh(crowdG, crowdM, seats.length);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.8 }), seats.length);
  const pal = [0x7a3b2e, 0x3e5a7a, 0x6b6a3a, 0x5a3e6b, 0x8a6a4a, 0x3a6b55, 0x9a8a70, 0x4a4a52, 0x8a2a2a, 0x2a4a3a];
  const skin = [0xe0b090, 0xc08a68, 0x8a5a3e, 0x6a8a5a, 0xd8c8b0, 0xa07050];
  const col = new THREE.Color();
  seats.forEach((s, i) => { crowd.setColorAt(i, col.setHex(pal[Math.floor(rnd() * pal.length)])); heads.setColorAt(i, col.setHex(skin[Math.floor(rnd() * skin.length)])); s.sc = 0.85 + rnd() * 0.3; });
  crowd.castShadow = false; scene.add(crowd, heads);
  let cheer = 0;

  // torches on four pillars: fixed lights that only flicker (never added, removed or hidden)
  const torches = [];
  const flameM = new THREE.MeshBasicMaterial({ color: 0xffb050 });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2, r = R + 0.55;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 2.6, 10), stoneDark); pillar.position.set(Math.cos(a) * r, 1.3, Math.sin(a) * r); pillar.castShadow = true; scene.add(pillar);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.25, 0.3, 10), new THREE.MeshStandardMaterial({ color: 0x3a3330, metalness: 0.6, roughness: 0.5 })); bowl.position.set(pillar.position.x, 2.75, pillar.position.z); scene.add(bowl);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.75, 8), flameM); flame.position.set(pillar.position.x, 3.2, pillar.position.z); scene.add(flame);
    const light = new THREE.PointLight(0xff9a40, 9, 14, 1.6); light.position.set(Math.cos(a) * (r - 0.6), 3.4, Math.sin(a) * (r - 0.6)); scene.add(light);
    torches.push({ light, flame, ph: i * 1.7 });
  }
  // banners hanging from the wall between the torches
  const banM = [0x7a1e1e, 0x1e3a6a, 0x7a1e1e, 0x1e3a6a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, side: THREE.DoubleSide }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8; if (isGate(a)) continue;
    const r = R + 0.12;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), banM[i % 4]); b.position.set(Math.cos(a) * r, 0.95, Math.sin(a) * r); b.lookAt(0, 0.95, 0); scene.add(b);
  }

  return {
    floor,
    cheer(k = 1) { cheer = Math.max(cheer, k); },
    update(dt, t) {
      cheer = Math.max(0, cheer - dt * 0.4);
      seats.forEach((s, i) => {
        const hop = Math.max(0, Math.sin(t * s.sp + s.ph)) * (0.04 + cheer * 0.25);
        m4.makeScale(1, s.sc, 1).setPosition(s.x, s.y - 0.12 + hop, s.z); crowd.setMatrixAt(i, m4);
        m4.makeTranslation(s.x, s.y + 0.28 + 0.25 * s.sc + hop, s.z); heads.setMatrixAt(i, m4);
      });
      crowd.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
      for (const tc of torches) { const f = 0.85 + Math.sin(t * 9 + tc.ph) * 0.08 + Math.sin(t * 23 + tc.ph * 3) * 0.06; tc.light.intensity = 9 * f; tc.flame.scale.set(1, f * 1.1, 1); }
    },
  };
}

// ---------------------------------------------------------------- effects
function createFx(scene) {
  const add = o => { o.visible = false; scene.add(o); return o; };
  const arrowG = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 5).rotateX(Math.PI / 2);
  const boltG = new THREE.SphereGeometry(0.16, 10, 8);
  const ringG = new THREE.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2);
  const discG = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
  const sparkG = new THREE.SphereGeometry(0.06, 5, 4);
  const pool = { shot: [], warn: [], ring: [], spark: [] };
  const shotMats = new Map();
  const shotMat = (color, kind) => { const k = kind + color; if (!shotMats.has(k)) shotMats.set(k, kind === 'archer' ? new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.8 }) : new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })); return shotMats.get(k); };
  const live = { shots: new Map(), warns: new Map(), rings: [], sparks: [] };
  // every effect material is built here, up front, so the first blast doesn't stall to compile a shader
  const ringMats = [], sparkMats = [];
  const getRing = () => { let o = pool.ring.pop(); if (!o) { const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); ringMats.push(m); o = add(new THREE.Mesh(ringG, m)); } return o; };
  const getSpark = () => { let o = pool.spark.pop(); if (!o) { const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); sparkMats.push(m); o = add(new THREE.Mesh(sparkG, m)); } return o; };
  const getWarn = () => {
    let o = pool.warn.pop();
    if (!o) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.9, depthWrite: false })));
      g.add(new THREE.Mesh(discG, new THREE.MeshBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.22, depthWrite: false })));
      o = add(g);
    }
    return o;
  };
  // warm up: one of each, shown for the first frame then returned
  for (let i = 0; i < 6; i++) { pool.ring.push(getRing()); pool.spark.push(getSpark()); }
  pool.warn.push(getWarn());

  return {
    shot(s, y) {
      const o = new THREE.Mesh(s.kind === 'archer' ? arrowG : boltG, shotMat(s.color, s.kind));
      o.position.set(s.x, y, s.z); o.rotation.y = Math.atan2(s.vx, s.vz); scene.add(o); live.shots.set(s.id, o);
    },
    moveShot(s, y) { const o = live.shots.get(s.id); if (o) o.position.set(s.x, y, s.z); },
    endShot(id) { const o = live.shots.get(id); if (o) { scene.remove(o); live.shots.delete(id); } },
    clearShots() { for (const o of live.shots.values()) scene.remove(o); live.shots.clear(); },
    warn(key, x, z, r, color) {
      const o = getWarn(); o.visible = true; o.position.set(x, 0.03, z); o.scale.setScalar(r);
      const c = new THREE.Color(color || '#ff5040'); o.children[0].material.color.copy(c); o.children[1].material.color.copy(c);
      live.warns.set(key, o); return o;
    },
    warnFill(key, k) { const o = live.warns.get(key); if (o) { o.children[1].scale.setScalar(Math.max(0.02, k)); o.children[1].material.opacity = 0.15 + k * 0.3; } },
    endWarn(key) { const o = live.warns.get(key); if (o) { o.visible = false; pool.warn.push(o); live.warns.delete(key); } },
    ring(x, z, r, color, life = 0.5, y = 0.05) {
      const o = getRing(); o.visible = true; o.position.set(x, y, z); o.material.color.set(color); o.material.opacity = 1;
      live.rings.push({ o, t: 0, life, r });
    },
    sparks(x, y, z, color, n = 8) {
      for (let i = 0; i < n; i++) {
        const o = getSpark(); o.visible = true; o.position.set(x, y, z); o.material.color.set(color); o.material.opacity = 1;
        const a = Math.random() * Math.PI * 2, u = Math.random() * 3 + 1;
        live.sparks.push({ o, t: 0, life: 0.35 + Math.random() * 0.2, v: [Math.cos(a) * u, 1.5 + Math.random() * 2.5, Math.sin(a) * u] });
      }
    },
    update(dt) {
      live.rings = live.rings.filter(r => {
        r.t += dt; const k = r.t / r.life;
        if (k >= 1) { r.o.visible = false; pool.ring.push(r.o); return false; }
        r.o.scale.setScalar(r.r * (0.3 + 0.7 * Math.sqrt(k))); r.o.material.opacity = 1 - k; return true;
      });
      live.sparks = live.sparks.filter(s => {
        s.t += dt; const k = s.t / s.life;
        if (k >= 1) { s.o.visible = false; pool.spark.push(s.o); return false; }
        s.v[1] -= 9 * dt; s.o.position.x += s.v[0] * dt; s.o.position.y += s.v[1] * dt; s.o.position.z += s.v[2] * dt;
        s.o.material.opacity = 1 - k; return true;
      });
    },
    clear() {
      this.clearShots();
      for (const k of [...live.warns.keys()]) this.endWarn(k);
      for (const r of live.rings) { r.o.visible = false; pool.ring.push(r.o); } live.rings = [];
      for (const s of live.sparks) { s.o.visible = false; pool.spark.push(s.o); } live.sparks = [];
    },
  };
}
