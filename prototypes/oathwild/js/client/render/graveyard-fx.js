// The Old Graveyard's living parts (graveyard-draw.js builds them once; nothing is created, toggled or disposed while
// you play — lessons rule 29):
//   createHoles(list)          dug graves: a dark soil pit seen THROUGH the ground. The terrain is one solid mesh, so the
//                              pit is drawn after it and each pixel asks "does my sight line pass through the opening?"
//                              (a ray–plane test in the pit's own frame) — if not, it is not drawn; if so, it is drawn
//                              and written at the depth of the opening, so whatever stands in front still hides it.
//                              No stencil, no hole cut in the ground mesh, no two faces in one plane (rule 83).
//   createGlows(n)             flames + their soft glow: one instanced billboard mesh (candles, braziers, lanterns)
//   createGroundFog(...)       a low drifting fog band (0-3.5 m) over the cemetery: soft vertical billboards, faded at
//                              the bottom so the ground never cuts them with a hard line
//   createCrows(...)           crows on perches that lift off when you come within ~8 m, circle, and come back later
//   createLabel()              a carved-plaque label over the stone you stand at (name + dates; no browser tooltip)
import * as THREE from 'three';

// ---------------------------------------------------------------- dug holes
const HOLE_VERT = /* glsl */`
  #include <common>
  varying vec3 vLoc; varying vec3 vCam; varying vec3 vW;
  void main() {
    mat4 M = modelMatrix;
    #ifdef USE_INSTANCING
      M = modelMatrix * instanceMatrix;
    #endif
    vLoc = position;
    vCam = (inverse(M) * vec4(cameraPosition, 1.0)).xyz;
    vec4 w = M * vec4(position, 1.0); vW = w.xyz;
    vec4 mvPosition = viewMatrix * w;
    gl_Position = projectionMatrix * mvPosition;
  }`;
const HOLE_FRAG = /* glsl */`
  #include <common>
  uniform mat4 projectionMatrix;
  uniform sampler2D uDirt; uniform vec2 uHalf; uniform float uDeep;
  varying vec3 vLoc; varying vec3 vCam; varying vec3 vW;
  void main() {
    vec3 d = vLoc - vCam;
    if (vCam.y <= 0.0 || d.y >= -1e-5 || vLoc.y > 1e-3) discard;            // the opening is the plane y = 0 of the pit's frame
    float t = -vCam.y / d.y;
    vec3 h = vCam + d * t;
    if (abs(h.x) > uHalf.x || abs(h.z) > uHalf.y) discard;   // the sight line misses the opening: the ground hides this
    // written at the opening's depth (a few cm toward you): a stone or a hero in front of the hole still covers it
    vec3 hw = cameraPosition + (vW - cameraPosition) * t;
    hw += normalize(cameraPosition - hw) * 0.05;
    vec4 clip = projectionMatrix * viewMatrix * vec4(hw, 1.0);
    gl_FragDepth = clamp(clip.z / clip.w * 0.5 + 0.5, 0.0, 1.0);
    // soil walls, a darker floor; deeper = darker; spade marks as soft horizontal bands
    bool xw = abs(abs(vLoc.x) - uHalf.x) < 0.02, zw = abs(abs(vLoc.z) - uHalf.y) < 0.02;
    vec2 uv = xw ? vLoc.zy : zw ? vLoc.xy : vLoc.xz;
    vec3 c = texture2D(uDirt, uv * 0.85 + 0.37).rgb;
    float depthK = smoothstep(-uDeep, 0.0, vLoc.y);
    float shade = xw ? (vLoc.x > 0.0 ? 0.55 : 0.8) : zw ? (vLoc.z > 0.0 ? 0.5 : 0.72) : 0.3;
    float cuts = 0.9 + 0.1 * sin(vLoc.y * 23.0 + uv.x * 3.0);
    c *= shade * cuts * mix(0.16, 0.85, depthK * depthK);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** Pits for open graves (and the collapsed grave): list = [{ matrix }] in the pit frame (y 0 = the opening plane). */
export function createHoles(list, { dirt, half = [0.55, 0.95], deep = 1.55 }) {
  const g = new THREE.BoxGeometry(half[0] * 2, deep, half[1] * 2);
  g.translate(0, -deep / 2, 0);                               // the opening at y 0, the floor `deep` below it
  const m = new THREE.ShaderMaterial({
    vertexShader: HOLE_VERT, fragmentShader: HOLE_FRAG, side: THREE.BackSide, fog: false,
    uniforms: { uDirt: { value: null }, uHalf: { value: new THREE.Vector2(...half) }, uDeep: { value: deep } },
  });
  m.uniforms.uDirt.value = dirt;
  m.name = 'graveyard pits';
  const mesh = new THREE.InstancedMesh(g, m, Math.max(1, list.length));
  list.forEach((h, i) => mesh.setMatrixAt(i, h.matrix));
  mesh.count = list.length;
  mesh.renderOrder = 10;                                     // after the ground and everything solid
  mesh.frustumCulled = false; mesh.name = 'graveyard pits';
  return mesh;
}

// ---------------------------------------------------------------- flames + glow billboards (one draw)
const GLOW_VERT = /* glsl */`
  #include <common>
  #include <fog_pars_vertex>
  attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iCol; attribute float iKind;
  varying vec2 vUv; varying vec4 vCol; varying float vKind;
  void main() {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    if (iKind < 0.5) {                                       // a flame stands upright and turns to face you
      vec3 to = vec3(cameraPosition.x - iPos.x, 0.0, cameraPosition.z - iPos.z);
      to = length(to) > 1e-3 ? normalize(to) : vec3(0.0, 0.0, 1.0);
      right = vec3(to.z, 0.0, -to.x); up = vec3(0.0, 1.0, 0.0);
    }
    vec3 wp = iPos + right * position.x * iSize.x + up * (position.y + (iKind < 0.5 ? 0.5 : 0.0)) * iSize.y;
    vUv = uv; vCol = iCol; vKind = iKind;
    vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const GLOW_FRAG = /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  varying vec2 vUv; varying vec4 vCol; varying float vKind;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float a; vec3 c = vCol.rgb;
    if (vKind < 0.5) {
      // a teardrop: wide and white-hot at the bottom, narrowing to a tip
      float w = mix(0.95, 0.06, smoothstep(-0.9, 1.0, p.y)) * (1.0 - smoothstep(0.65, 1.0, -p.y));
      a = smoothstep(w, w * 0.35, abs(p.x)) * smoothstep(1.0, 0.55, p.y);
      c = mix(c, vec3(1.0, 0.97, 0.85), smoothstep(0.2, -0.7, p.y) * (1.0 - abs(p.x) / max(w, 1e-3)));
    } else { float r = length(p); a = pow(max(0.0, 1.0 - r), 2.2); }
    a *= vCol.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(c * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export function createGlows(n) {
  const g = new THREE.InstancedBufferGeometry();
  const q = new THREE.PlaneGeometry(1, 1);
  g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv);
  const A = (name, k) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * k), k); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; };
  const att = { pos: A('iPos', 3), size: A('iSize', 2), col: A('iCol', 4), kind: A('iKind', 1) };
  g.instanceCount = n;
  const m = new THREE.ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, fog: true, uniforms: THREE.UniformsUtils.clone(THREE.UniformsLib.fog) });
  m.name = 'graveyard flames';
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.name = 'graveyard flames';
  return { mesh, att };
}

// ---------------------------------------------------------------- low ground fog
const FOG_VERT = /* glsl */`
  attribute vec3 iPos; attribute vec2 iSize; attribute float iA; attribute float iSeed;
  varying vec2 vUv; varying float vA; varying float vSeed;
  void main() {
    vec3 to = vec3(cameraPosition.x - iPos.x, 0.0, cameraPosition.z - iPos.z);
    float d = length(to);
    to = d > 1e-3 ? to / d : vec3(0.0, 0.0, 1.0);
    vec3 right = vec3(to.z, 0.0, -to.x);
    vec3 wp = iPos + right * position.x * iSize.x + vec3(0.0, (position.y + 0.5) * iSize.y, 0.0);
    vUv = uv; vSeed = iSeed;
    float dc = distance(cameraPosition, wp);
    vA = iA * smoothstep(1.5, 6.0, dc) * (1.0 - smoothstep(48.0, 62.0, dc));
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;
const FOG_FRAG = /* glsl */`
  uniform vec3 uFogCol; uniform float uTime;
  varying vec2 vUv; varying float vA; varying float vSeed;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    vec2 p = vUv;
    // soft at both sides, thin at the bottom (no hard line where it meets the ground), thinning upward
    float side = smoothstep(0.0, 0.28, p.x) * smoothstep(1.0, 0.72, p.x);
    float v = smoothstep(0.0, 0.3, p.y) * (1.0 - smoothstep(0.35, 1.0, p.y));
    vec2 q = vec2(p.x * 2.6 + vSeed * 7.0 + uTime * 0.03, p.y * 1.3 - uTime * 0.01);
    float n = vn(q * 2.0) * 0.6 + vn(q * 4.7 + 3.1) * 0.4;
    float a = vA * side * v * smoothstep(0.25, 0.75, n);
    if (a < 0.003) discard;
    gl_FragColor = vec4(uFogCol, a);
    #include <colorspace_fragment>
  }`;

/** pick(i, rng) → a spot { x, z, y } for fog piece i near the focus; null = none there. */
export function createGroundFog(n, { colour = '#a9bab4' } = {}) {
  const g = new THREE.InstancedBufferGeometry();
  const q = new THREE.PlaneGeometry(1, 1);
  g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv);
  const A = (name, k) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * k), k); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; };
  const att = { pos: A('iPos', 3), size: A('iSize', 2), a: A('iA', 1), seed: A('iSeed', 1) };
  g.instanceCount = n;
  const m = new THREE.ShaderMaterial({ vertexShader: FOG_VERT, fragmentShader: FOG_FRAG, transparent: true, depthWrite: false, uniforms: { uFogCol: { value: new THREE.Color(colour) }, uTime: { value: 0 } } });
  m.name = 'graveyard ground fog';
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.name = 'graveyard ground fog';
  return { mesh, att, uniforms: m.uniforms };
}

// ---------------------------------------------------------------- crows
/**
 * Crows: parts = { body, wingL, wingR } geometries (House Kit, painted black cloth); perches [{ x, y, z, face }];
 * circling [{ x, y, z, r }] crows that wheel overhead all the time. update(dt, t, focus) — a crow within `near` metres of
 * the focus lifts off, wheels round its perch 10-20 m up, and comes back once you have been gone a while.
 */
export function createCrows({ geos, material, perches, circling = [], near = 8 }) {
  const n = perches.length + circling.length;
  const mk = (geo, name) => { const m = new THREE.InstancedMesh(geo, material, Math.max(1, n)); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.castShadow = true; m.name = name; return m; };
  const body = mk(geos.body, 'crows'), wl = mk(geos.wingL, 'crow wings L'), wr = mk(geos.wingR, 'crow wings R');
  const birds = [
    ...perches.map((p, i) => ({ home: p, x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, face: p.face, state: 'perched', away: 0, ph: i * 1.7, orbitR: 12 + (i % 5) * 2.5, orbitH: 11 + (i % 4) * 2.5, dir: i % 2 ? 1 : -1 })),
    ...circling.map((c, i) => ({ home: null, centre: c, x: c.x + c.r, y: c.y, z: c.z, vx: 0, vy: 0, vz: 0, face: 0, state: 'circle', ph: i * 2.3, orbitR: c.r, orbitH: 0, dir: i % 2 ? 1 : -1 })),
  ];
  const M = new THREE.Matrix4(), W = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
  const shoulder = [new THREE.Vector3(0.07, 0.16, 0.03), new THREE.Vector3(-0.07, 0.16, 0.03)];
  function place(i, b, t) {
    const flying = b.state !== 'perched';
    const pitch = flying ? Math.max(-0.5, Math.min(0.5, -b.vy * 0.12)) : 0;
    const peck = !flying ? Math.max(0, Math.sin(t * 0.9 + b.ph * 3.1)) ** 12 * 0.5 : 0;   // now and then a look down
    E.set(pitch + peck, b.face, 0, 'YXZ'); Q.setFromEuler(E);
    M.compose(P.set(b.x, b.y, b.z), Q, S);
    body.setMatrixAt(i, M);
    // wings: folded along the back when perched; spread and beating (or gliding) in flight
    const climb = flying ? Math.min(1, Math.max(0.25, b.vy * 0.4 + 0.45)) : 0;
    const flap = flying ? Math.sin(t * 15 + b.ph) * 0.85 * climb + 0.1 : 0;
    const fold = flying ? 0 : 1.35;
    for (const s of [0, 1]) {
      const sg = s ? -1 : 1;
      E.set(0, sg * fold, sg * (flying ? flap : 0.1), 'YXZ'); Q.setFromEuler(E);
      W.compose(shoulder[s], Q, S);
      W.premultiply(M);
      (s ? wr : wl).setMatrixAt(i, W);
    }
  }
  birds.forEach((b, i) => place(i, b, 0));
  let t = 0;
  return {
    meshes: [body, wl, wr], birds,
    get flying() { return birds.filter(b => b.home && b.state !== 'perched').length; },
    update(dt, focus) {
      t += dt;
      birds.forEach((b, i) => {
        let tx, ty, tz, speed = 7;
        if (b.state === 'circle') {
          const c = b.centre, a = t * 0.25 * b.dir + b.ph;
          tx = c.x + Math.cos(a) * c.r; tz = c.z + Math.sin(a) * c.r; ty = c.y + Math.sin(t * 0.3 + b.ph) * 2;
        } else {
          const h = b.home, dh = focus ? Math.hypot(focus.x - h.x, focus.z - h.z) : 99;
          if (b.state === 'perched') {
            if (dh < near) { b.state = 'flee'; b.away = 0; const dx = h.x - focus.x, dz = h.z - focus.z, L = Math.hypot(dx, dz) || 1; b.vx = dx / L * 3; b.vz = dz / L * 3; b.vy = 4; }
            else { place(i, b, t); return; }
          }
          if (b.state === 'flee') {
            b.away += dt;
            const a = t * 0.35 * b.dir + b.ph;
            tx = h.x + Math.cos(a) * b.orbitR; tz = h.z + Math.sin(a) * b.orbitR; ty = h.y + b.orbitH;
            if (dh > near * 2.6) b.away += dt * 0.5; else b.away = Math.min(b.away, 4);
            if (b.away > 16) b.state = 'return';
          }
          if (b.state === 'return') {
            if (dh < near * 1.4) { b.state = 'flee'; b.away = 0; }
            tx = h.x; ty = h.y; tz = h.z; speed = 5;
            const d = Math.hypot(tx - b.x, ty - b.y, tz - b.z);
            if (d < 0.25) { b.state = 'perched'; b.x = h.x; b.y = h.y; b.z = h.z; b.vx = b.vy = b.vz = 0; b.face = h.face; place(i, b, t); return; }
            speed = Math.min(5, 1 + d);
          }
        }
        // steer toward the target (a bird turns, it does not slide)
        const dx = tx - b.x, dy = ty - b.y, dz = tz - b.z, L = Math.hypot(dx, dy, dz) || 1;
        const k = Math.min(1, dt * 2.2);
        b.vx += (dx / L * speed - b.vx) * k; b.vy += (dy / L * speed * 0.8 - b.vy) * k; b.vz += (dz / L * speed - b.vz) * k;
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        if (Math.hypot(b.vx, b.vz) > 0.3) b.face = Math.atan2(b.vx, b.vz);
        place(i, b, t);
      });
      for (const m of [body, wl, wr]) m.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- the stone label
/** A plaque over a stone: show(text, sub, at) / hide(); update(dt) fades it. One sprite, made once. */
export function createLabel() {
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 168;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0, fog: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.15, 0.3, 1); sprite.renderOrder = 20; sprite.name = 'graveyard stone label';
  sprite.position.set(0, -500, 0);
  let want = 0, key = '';
  function draw(name, sub) {
    g.clearRect(0, 0, cv.width, cv.height);
    const r = 22, W = cv.width - 8, H = cv.height - 8;
    g.fillStyle = 'rgba(24, 22, 20, 0.78)'; g.strokeStyle = 'rgba(206, 182, 128, 0.75)'; g.lineWidth = 3;
    g.beginPath(); g.roundRect(4, 4, W, H, r); g.fill(); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = 50;
    do { g.font = `600 ${fs}px Cinzel, Georgia, serif`; fs -= 2; } while (g.measureText(name).width > W - 40 && fs > 24);
    g.fillStyle = '#efe6cf'; g.fillText(name, cv.width / 2, sub ? 64 : cv.height / 2);
    if (sub) { g.font = '500 34px "Alegreya Sans", Georgia, serif'; g.fillStyle = '#c8bb9a'; g.fillText(sub, cv.width / 2, 122); }
    tex.needsUpdate = true;
  }
  return {
    sprite,
    get text() { return mat.opacity > 0.05 ? key : null; },
    show(name, sub, x, y, z) { const k = `${name} · ${sub || ''}`; if (k !== key) { key = k; draw(name, sub); } sprite.position.set(x, y, z); want = 1; },
    hide() { want = 0; },
    update(dt) { mat.opacity += (want - mat.opacity) * Math.min(1, dt * 6); if (mat.opacity < 0.01 && !want) sprite.position.y = -500; },
  };
}
