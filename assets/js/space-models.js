// Space models — procedural Three.js objects for anything that happens off a planet's surface:
// planets with real map textures, stars of every class, asteroid belts, and the small craft that
// move between them.
//
//   import { createPlanet, createStar, createSpaceScene } from '../assets/js/space-models.js';
//   const scene = createSpaceScene(container);
//   const planet = createPlanet(planetRecord, { texture });   // texture from universe/js/texture.js
//   scene.scene.add(planet.group);
//   scene.addTicker(planet.update);
//
// Every builder returns the same shape as the creature models in avatar-3d:
//   { group, update(dt, t), dispose(), ...extras }
//
// Nothing here needs the universe library: pass a texture set if you have one and the model uses it,
// leave it out and the model builds its own (rougher, but never a plain grey ball). All of it is
// primitives and canvases — no meshes to download, no licences to track.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeNoise3D, makeRng, subSeed, clamp, lerp } from '../../worldgen/js/noise.js';

// ---------------------------------------------------------------------------- small helpers

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.75, metalness: 0.25, ...extra });
const glow = (color, opacity = 1, blending = THREE.AdditiveBlending) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity, blending, depthWrite: false });
const mesh = (geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = false; return o; };

function canvas2d(w, h) {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(w, h);
  c.width = w; c.height = h;
  return c;
}

/** A soft round sprite — the workhorse for glows, coronas and starfield points. */
export function glowSprite(color = '#ffffff', size = 128, softness = 0.5) {
  const c = canvas2d(size, size), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(clamp(softness * 0.4, 0.02, 0.6), hexA(color, 0.75));
  g.addColorStop(clamp(softness, 0.2, 0.95), hexA(color, 0.22));
  g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function hexA(hex, a) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** A 2:1 blotchy sphere texture, for when no real map was handed in. */
export function proceduralPlanetTexture(seed = 1, colors = ['#4a5a44', '#7a6a4a', '#2a3a5a'], size = 512) {
  const W = size, H = size >> 1;
  const c = canvas2d(W, H), ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const n = makeNoise3D(subSeed(seed, 'proc'));
  const rgb = colors.map(h => { const v = parseInt(h.replace('#', ''), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; });
  for (let y = 0; y < H; y++) {
    const lat = ((y + 0.5) / H - 0.5) * Math.PI;
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * Math.PI * 2;
      const cl = Math.cos(lat);
      const px = Math.cos(lon) * cl, py = Math.sin(lat), pz = Math.sin(lon) * cl;
      let f = 0, amp = 0.5, freq = 1.8;
      for (let o = 0; o < 5; o++) { f += amp * n(px * freq, py * freq, pz * freq); amp *= 0.52; freq *= 2.1; }
      const t = clamp(f * 0.5 + 0.5, 0, 1) * (rgb.length - 1);
      const i0 = Math.floor(t), i1 = Math.min(rgb.length - 1, i0 + 1), k = t - i0;
      const o = (y * W + x) * 4;
      img.data[o] = lerp(rgb[i0][0], rgb[i1][0], k);
      img.data[o + 1] = lerp(rgb[i0][1], rgb[i1][1], k);
      img.data[o + 2] = lerp(rgb[i0][2], rgb[i1][2], k);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function canvasTexture(canvas, { repeatWrap = true } = {}) {
  if (!canvas) return null;
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeatWrap) t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Rim light on the edge of a sphere — the shell that makes an atmosphere read as an atmosphere. */
function atmosphereMaterial(color, power = 2.6, strength = 1.0) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uPower: { value: power }, uStrength: { value: strength } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uPower; uniform float uStrength;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float rim = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), uPower);
        gl_FragColor = vec4(uColor, rim * uStrength);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
  });
}

/** A ring system's texture: banded, with gaps, alpha down the middle of each gap. */
function ringTexture(spec, seed = 1) {
  const W = 512, H = 8;
  const c = canvas2d(W, H), ctx = c.getContext('2d');
  const rng = makeRng(subSeed(seed, 'rings'));
  const base = spec.color || '#d8c8a8';
  ctx.clearRect(0, 0, W, H);
  for (let x = 0; x < W; x++) {
    const t = x / W;
    let a = 0.55 + Math.sin(t * Math.PI * rng.int(9, 26)) * 0.3 + (rng() - 0.5) * 0.12;
    a *= Math.sin(Math.pow(t, 0.6) * Math.PI) * 0.6 + 0.55;      // fade at both edges
    ctx.fillStyle = hexA(base, clamp(a, 0, 1) * (spec.opacity ?? 0.7));
    ctx.fillRect(x, 0, 1, H);
  }
  // a few dark gaps
  for (let g = 0; g < (spec.gaps ?? 2); g++) {
    const x = rng.range(0.15, 0.9) * W, w = rng.range(3, 16);
    ctx.clearRect(x, 0, w, H);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** RingGeometry with its UVs redone so u runs from the inner edge to the outer one. */
function ringGeometry(inner, outer, segments = 96) {
  const geo = new THREE.RingGeometry(inner, outer, segments, 2);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = v.length();
    uv.setXY(i, clamp((r - inner) / (outer - inner), 0, 1), 0.5);
  }
  uv.needsUpdate = true;
  return geo;
}

function disposeGroup(group) {
  group.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { for (const k of ['map', 'bumpMap', 'emissiveMap', 'alphaMap']) if (m[k]?.dispose) m[k].dispose(); m.dispose(); }
    }
  });
}

// ---------------------------------------------------------------------------- the scene

/**
 * A scene set up for space: black background, one star-coloured key light, orbit controls, a loop.
 * Same interface as avatar-3d's createScene so the two are interchangeable.
 */
export function createSpaceScene(container, { background = 0x05070d, ambient = 0.22, distance = 5, fov = 42 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.02, 4000);
  camera.position.set(0, distance * 0.35, distance);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.minDistance = 0.4; controls.maxDistance = 900;
  controls.update();

  const amb = new THREE.AmbientLight(0x8899bb, ambient); scene.add(amb);
  const key = new THREE.DirectionalLight(0xffffff, 3.0); key.position.set(5, 1.5, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0x5566aa, 0.35); rim.position.set(-4, -1, -3); scene.add(rim);

  const clock = new THREE.Clock();
  const tickers = new Set();
  let running = true, spin = 0;

  function resize() {
    const w = container.clientWidth || 640, h = container.clientHeight || 480;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(container);
  resize();

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, clock.getDelta());
    for (const t of tickers) t(dt, clock.elapsedTime);
    if (spin) { for (const o of scene.children) if (o.userData.spinnable) o.rotation.y += spin * dt; }
    controls.update();
    renderer.render(scene, camera);
  }
  loop();

  return {
    renderer, scene, camera, controls, ambient: amb, key, rim,
    addTicker: f => tickers.add(f), removeTicker: f => tickers.delete(f),
    clearTickers: () => tickers.clear(),
    setSpin: v => { spin = v; },
    /** Point the key light at the camera-relative position of a star, in its colour. */
    setStarLight: (color, intensity = 3, pos = [5, 1.5, 3]) => { key.color = new THREE.Color(color); key.intensity = intensity; key.position.set(...pos); },
    resize,
    snapshot: () => renderer.domElement.toDataURL('image/png'),
    dispose: () => { running = false; controls.dispose(); renderer.dispose(); renderer.domElement.remove(); },
    THREE,
  };
}

// ---------------------------------------------------------------------------- planets

const ARCH_COLORS = {
  barren: ['#3a3733', '#6a6259', '#8e867a'],
  ice: ['#6f90a8', '#bcd8e8', '#eef6fb'],
  lava: ['#1c0c08', '#6a1e0a', '#ff7a2a'],
  desert: ['#6a4526', '#c0904e', '#e6c489'],
  ocean: ['#0a3050', '#1b6a94', '#7fc0d8'],
  gasGiant: ['#8a6a48', '#c8a878', '#f0dcb8'],
  iceGiant: ['#255a78', '#4fa8c8', '#a8e0ef'],
  toxic: ['#4a4a14', '#8a8a2e', '#d0c86a'],
  tundra: ['#3a4a48', '#7a8a84', '#cfe0e0'],
  jungle: ['#123a28', '#1e6b3a', '#5aa86a'],
  living: ['#123a5e', '#2f7a44', '#c8b88a'],
  crystal: ['#2a2050', '#6a58a8', '#c0b0f0'],
  voidTouched: ['#0a0810', '#2e2440', '#5a4a78'],
  tidalLocked: ['#241a18', '#7a4a30', '#d8c0a0'],
};

/**
 * A planet: textured sphere, atmosphere rim, cloud deck, rings, moons.
 * planet: a record from universe/js/system.js (only archetype, radius, atmosphere, rings, moons and
 *         seed are read, so a hand-written object works too).
 * opts:   { texture } — the layer set from universe/js/texture.js: { map, clouds, lights, bump }.
 *         { radius } — how big to draw it in scene units (default 1).
 *         { textureSize } — size of the built-in fallback texture when no `texture` is handed in.
 *         { moons: false } to leave them out, { detail } for the sphere segments.
 */
export function createPlanet(planet = {}, opts = {}) {
  const group = new THREE.Group();
  group.userData.spinnable = true;
  const radius = opts.radius ?? 1;
  const detail = opts.detail ?? 64;
  const arch = planet.archetype || 'barren';
  const tex = opts.texture || {};

  const mapCanvas = tex.map || proceduralPlanetTexture(planet.seed ?? 1, ARCH_COLORS[arch] || ARCH_COLORS.barren, opts.textureSize ?? 512);
  const map = canvasTexture(mapCanvas);
  const bump = canvasTexture(tex.bump, { repeatWrap: false });
  const lights = canvasTexture(tex.lights, { repeatWrap: false });
  const molten = canvasTexture(tex.emissive, { repeatWrap: false });

  const surfaceMat = new THREE.MeshStandardMaterial({
    map, bumpMap: bump || null, bumpScale: bump ? (planet.giant ? 0 : 0.035) : 0,
    roughness: arch === 'ocean' || arch === 'living' ? 0.62 : 0.92,
    metalness: 0.04,
    emissive: new THREE.Color(molten ? '#ffffff' : lights ? '#ffc98a' : '#000000'),
    emissiveMap: molten || lights || null,
    emissiveIntensity: molten ? 1.1 : lights ? 1.0 : 0,
  });
  // Town lights only belong on the night side. The standard material has no idea where the star is,
  // so patch its shader: keep a world-space normal and fade the emissive out as the ground turns
  // toward the light. Lava keeps glowing on both sides, which is the point of lava.
  const sunDir = new THREE.Vector3(...(opts.sunDirection || [1, 0.2, 0.4])).normalize();
  if (lights && !molten) {
    surfaceMat.onBeforeCompile = shader => {
      shader.uniforms.uSunDir = { value: sunDir };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldN;')
        .replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvWorldN = normalize(mat3(modelMatrix) * objectNormal);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSunDir;\nvarying vec3 vWorldN;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= smoothstep(0.10, -0.30, dot(normalize(vWorldN), uSunDir));');
      surfaceMat.userData.shader = shader;
    };
  }

  const surface = new THREE.Mesh(new THREE.SphereGeometry(radius, detail, detail >> 1), surfaceMat);
  surface.name = 'surface';
  group.add(surface);

  // atmosphere: a slightly larger back-facing shell with a rim-light shader
  let atmo = null;
  const density = planet.atmosphere?.density ?? 0;
  if (density > 0.03 || planet.giant) {
    const strength = clamp(0.35 + density * 0.55, 0.2, 1.1);
    atmo = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.035, 48, 24),
      atmosphereMaterial(planet.atmosphere?.color || '#8fc0ff', 2.4, strength),
    );
    atmo.name = 'atmosphere';
    group.add(atmo);
  }

  // clouds on their own sphere, turning a little faster than the ground
  let clouds = null;
  if (tex.clouds) {
    clouds = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.013, 48, 24),
      new THREE.MeshStandardMaterial({ map: canvasTexture(tex.clouds), transparent: true, depthWrite: false, roughness: 1, metalness: 0, opacity: 0.85 }),
    );
    clouds.name = 'clouds';
    group.add(clouds);
  }

  // rings
  let rings = null;
  if (planet.rings && opts.rings !== false) {
    const r = planet.rings;
    rings = new THREE.Mesh(
      ringGeometry(radius * r.inner, radius * r.outer, 128),
      new THREE.MeshBasicMaterial({ map: ringTexture(r, planet.seed ?? 1), transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 1 }),
    );
    rings.rotation.x = Math.PI / 2 + (r.tilt ?? 0) * 0.35;
    rings.name = 'rings';
    group.add(rings);
  }

  // moons on tilted circular orbits
  const moons = [];
  if (opts.moons !== false) {
    for (const [i, m] of (planet.moons || []).entries()) {
      const pivot = new THREE.Group();
      pivot.rotation.x = (m.tilt ?? 0.12) * (i % 2 ? -1 : 1) + (i * 0.13);
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(radius * 0.035, radius * (m.radius ?? 0.15) / Math.max(0.3, planet.radius ?? 1) * 0.4), 24, 12),
        new THREE.MeshStandardMaterial({ map: canvasTexture(opts.moonTextures?.[i] || proceduralPlanetTexture(m.seed ?? i, m.kind === 'ice' ? ARCH_COLORS.ice : m.kind === 'lava' ? ARCH_COLORS.lava : ARCH_COLORS.barren, 128)), roughness: 1 }),
      );
      const dist = radius * (m.distance ?? (2.5 + i));
      body.position.x = dist;
      pivot.add(body);
      pivot.userData = { speed: 0.5 / Math.max(0.3, m.periodDays ?? (1 + i)), phase: i * 1.3 };
      pivot.rotation.y = pivot.userData.phase;
      group.add(pivot);
      moons.push({ pivot, body, spec: m });
    }
  }

  const spinRate = planet.giant ? 0.14 : 0.055;
  group.rotation.z = ((planet.axialTilt ?? 12) * Math.PI) / 180;

  return {
    group, surface, atmosphere: atmo, clouds, rings, moons, material: surfaceMat,
    /** Where the star is, from the planet's point of view — decides which half is night. */
    setSunDirection(x, y, z) { sunDir.set(x, y, z).normalize(); },
    update(dt) {
      surface.rotation.y += spinRate * dt;
      if (clouds) clouds.rotation.y += spinRate * 1.35 * dt;
      for (const m of moons) m.pivot.rotation.y += m.pivot.userData.speed * dt;
    },
    dispose() { disposeGroup(group); },
  };
}

// ---------------------------------------------------------------------------- stars

/**
 * A star. Emissive core, corona sprite, outer glow, and the odd ones get their own parts:
 * a binary pair orbits, a neutron star spins with two jets, a black hole has an accretion disc.
 * Returns { group, light, update, dispose } — `light` is a PointLight you can add to a system view.
 */
export function createStar(star = {}, opts = {}) {
  const group = new THREE.Group();
  const key = star.classKey || 'yellow';
  const color = star.color || '#ffe9a8';
  const corona = star.corona || color;
  const radius = opts.radius ?? 1;
  const black = key === 'blackHole';

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(radius * (black ? 0.55 : 1), 48, 24),
    black ? new THREE.MeshBasicMaterial({ color: 0x000000 })
      : new THREE.MeshBasicMaterial({ color: new THREE.Color(color) }),
  );
  core.name = 'core';
  group.add(core);

  // a soft shell so the edge is not a hard circle
  let shell = null;
  if (!black) {
    shell = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.12, 32, 16), atmosphereMaterial(corona, 1.7, 0.9));
    shell.material.side = THREE.FrontSide;
    group.add(shell);
  }

  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(black ? '#ff9a3c' : corona, 256, 0.55), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  flare.scale.setScalar(radius * (black ? 5 : 6.5));
  group.add(flare);

  // decay 1 rather than the physical 2: a system view has to stay readable out to the last orbit
  const lightColor = new THREE.Color(black ? '#ffb46a' : color).lerp(new THREE.Color('#ffffff'), 0.45);
  const light = new THREE.PointLight(lightColor, opts.lightIntensity ?? 4, 0, 1);
  group.add(light);

  // accretion disc for the two collapsed ones
  let disc = null;
  if (star.accretion) {
    const a = star.accretion;
    disc = new THREE.Mesh(
      ringGeometry(radius * (black ? 1.5 : 2.2), radius * (black ? 4.5 : 5.5), 128),
      new THREE.MeshBasicMaterial({ map: accretionTexture(a, star.seed ?? 1), transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    disc.rotation.x = Math.PI / 2 - 0.32;
    group.add(disc);
  }

  // jets
  const jets = [];
  if (star.accretion?.jets) {
    for (const dir of [1, -1]) {
      const jet = new THREE.Mesh(
        new THREE.ConeGeometry(radius * 0.35, radius * 6, 14, 1, true),
        glow(black ? '#9fd8ff' : '#cfe8ff', 0.35),
      );
      jet.position.y = dir * radius * 3;
      jet.rotation.x = dir > 0 ? 0 : Math.PI;
      group.add(jet);
      jets.push(jet);
    }
  }

  // a companion for a binary pair
  let companion = null, pivot = null;
  if (star.companion) {
    pivot = new THREE.Group();
    const c = star.companion;
    const cr = radius * clamp((c.radius ?? 0.7) / Math.max(0.2, star.radius ?? 1), 0.35, 0.9);
    companion = new THREE.Mesh(new THREE.SphereGeometry(cr, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(c.color || '#ffd0a0') }));
    companion.position.x = radius * 3.2;
    const cflare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(c.corona || c.color || '#ffd0a0', 192, 0.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    cflare.scale.setScalar(cr * 5.5);
    cflare.position.copy(companion.position);
    pivot.add(companion, cflare);
    group.add(pivot);
    core.position.x = -radius * 0.6;
    flare.position.x = -radius * 0.6;
  }

  const pulse = key === 'neutronStar' ? 6 : star.flareRate > 0.5 ? 1.2 : 0.35;
  let t0 = 0;
  return {
    group, core, light, disc, jets, companion,
    update(dt, t) {
      t0 += dt;
      const time = t ?? t0;
      core.rotation.y += 0.08 * dt;
      if (disc) disc.rotation.z += 0.35 * dt;
      const p = 1 + Math.sin(time * pulse) * (key === 'neutronStar' ? 0.22 : 0.05);
      flare.scale.setScalar(radius * (black ? 5 : 6.5) * p);
      light.intensity = (opts.lightIntensity ?? 4) * (0.92 + (p - 1));
      for (const j of jets) j.material.opacity = 0.25 + Math.abs(Math.sin(time * pulse * 0.5)) * 0.25;
      if (pivot) pivot.rotation.y += dt * 0.25;
    },
    dispose() { disposeGroup(group); },
  };
}

/** The hot gradient of an accretion disc: white at the inside, red and thin at the outside. */
function accretionTexture(spec, seed) {
  const W = 512, H = 8;
  const c = canvas2d(W, H), ctx = c.getContext('2d');
  const rng = makeRng(subSeed(seed, 'accretion'));
  const hot = spec.color || '#ffa23c';
  for (let x = 0; x < W; x++) {
    const t = x / W;
    const a = Math.pow(1 - t, 1.6) * (0.55 + rng() * 0.45) * (spec.brightness ?? 1);
    const col = t < 0.25 ? '#ffffff' : t < 0.6 ? hot : '#c0391c';
    ctx.fillStyle = hexA(col, clamp(a, 0, 1));
    ctx.fillRect(x, 0, 1, H);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------- asteroid belt

/**
 * An instanced field of rocks in a flat annulus.
 * opts: { inner, outer, count, thickness, seed, color, tilt }
 */
export function createAsteroidBelt(opts = {}) {
  const { inner = 2, outer = 3.2, count = 500, thickness = 0.12, seed = 1, color = '#7a7168', tilt = 0 } = opts;
  const group = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const material = mat(color, { roughness: 1, metalness: 0.08, flatShading: true });
  const rocks = new THREE.InstancedMesh(geo, material, count);
  const rng = makeRng(subSeed(seed, 'belt'));
  const dummy = new THREE.Object3D();
  const spins = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const r = lerp(inner, outer, Math.pow(rng(), 0.7));
    dummy.position.set(Math.cos(a) * r, (rng() - 0.5) * thickness * (outer - inner), Math.sin(a) * r);
    dummy.rotation.set(rng() * 6.28, rng() * 6.28, rng() * 6.28);
    const s = (0.008 + Math.pow(rng(), 3) * 0.05) * outer;
    dummy.scale.set(s, s * rng.range(0.6, 1.2), s * rng.range(0.6, 1.2));
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
    spins[i] = rng.range(0.02, 0.1);
  }
  rocks.instanceMatrix.needsUpdate = true;
  group.add(rocks);
  group.rotation.x = tilt;

  return {
    group, rocks,
    update(dt) { group.rotation.y += 0.045 * dt; },
    dispose() { disposeGroup(group); },
  };
}

// ---------------------------------------------------------------------------- craft
// All of these are built around a 1-unit-long body so a scene can scale them freely.

const HULL = '#c8ccd4', HULL_DARK = '#5a616e', PANEL = '#1e3a6a', PANEL_LIT = '#3f7ad0', TRIM = '#d8a24a';

function solarPanel(w, h, tilt = 0) {
  const g = new THREE.Group();
  const panel = mesh(new THREE.BoxGeometry(w, 0.012, h), mat(PANEL, { roughness: 0.35, metalness: 0.6, emissive: new THREE.Color(PANEL_LIT), emissiveIntensity: 0.18 }));
  g.add(panel);
  // the grid of cells, as thin raised strips
  const strips = Math.max(2, Math.round(w * 6));
  for (let i = 0; i < strips; i++) {
    const s = mesh(new THREE.BoxGeometry(0.006, 0.016, h * 0.96), mat('#0d1a30'));
    s.position.x = -w / 2 + (i + 0.5) * (w / strips);
    g.add(s);
  }
  g.rotation.z = tilt;
  return g;
}

function dish(r, color = HULL) {
  const g = new THREE.Group();
  const bowl = mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), mat(color, { side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4 }));
  bowl.rotation.x = Math.PI;
  const stalk = mesh(new THREE.CylinderGeometry(r * 0.06, r * 0.06, r * 0.9, 8), mat(HULL_DARK));
  stalk.position.y = -r * 0.45;
  const feed = mesh(new THREE.SphereGeometry(r * 0.12, 10, 6), mat(TRIM));
  feed.position.y = -r * 0.82;
  g.add(bowl, stalk, feed);
  return g;
}

/** A blinking navigation light. */
function navLight(color = '#ff4444', size = 0.02) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(color, 64, 0.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size * 6);
  s.userData.blink = true;
  return s;
}

/** A small communications satellite: box bus, two wings, a dish and an antenna. */
export function createSatellite(opts = {}) {
  const group = new THREE.Group();
  const bus = mesh(new THREE.BoxGeometry(0.28, 0.24, 0.3), mat('#b8bcc4', { metalness: 0.55, roughness: 0.4 }));
  const gold = mesh(new THREE.BoxGeometry(0.29, 0.06, 0.31), mat(TRIM, { metalness: 0.8, roughness: 0.3 }));
  gold.position.y = -0.06;
  group.add(bus, gold);
  const left = solarPanel(0.55, 0.22); left.position.x = -0.45;
  const right = solarPanel(0.55, 0.22); right.position.x = 0.45;
  const boomL = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 6), mat(HULL_DARK)); boomL.rotation.z = Math.PI / 2; boomL.position.x = -0.25;
  const boomR = boomL.clone(); boomR.position.x = 0.25;
  group.add(left, right, boomL, boomR);
  const d = dish(0.16); d.position.set(0, 0.26, 0.02); d.rotation.x = -0.5;
  group.add(d);
  const ant = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.4, 6), mat(HULL));
  ant.position.set(0.06, -0.28, 0); group.add(ant);
  const blink = navLight('#4affa0'); blink.position.set(0, 0.14, 0.17); group.add(blink);

  return {
    group,
    update(dt, t) { group.rotation.y += 0.3 * dt; blink.material.opacity = 0.3 + 0.7 * (Math.sin((t ?? 0) * 4) > 0.6 ? 1 : 0); },
    dispose() { disposeGroup(group); },
  };
}

/** A deep-space probe: an octahedral core, one big dish, three legs and a thruster. */
export function createProbe(opts = {}) {
  const group = new THREE.Group();
  const core = mesh(new THREE.OctahedronGeometry(0.2, 0), mat('#9aa2ae', { flatShading: true, metalness: 0.6, roughness: 0.35 }));
  group.add(core);
  // the dish sits on a short mast straight above the core, open end up
  const d = dish(0.19); d.position.y = 0.3; group.add(d);
  const mast = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8), mat(HULL_DARK));
  mast.position.y = 0.16; group.add(mast);
  for (let i = 0; i < 3; i++) {
    const leg = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 6), mat(HULL_DARK));
    const a = (i / 3) * Math.PI * 2;
    leg.position.set(Math.cos(a) * 0.16, -0.2, Math.sin(a) * 0.16);
    leg.rotation.z = Math.cos(a) * 0.5; leg.rotation.x = -Math.sin(a) * 0.5;
    group.add(leg);
    const pod = mesh(new THREE.SphereGeometry(0.035, 10, 6), mat(TRIM));
    pod.position.set(Math.cos(a) * 0.27, -0.38, Math.sin(a) * 0.27);
    group.add(pod);
  }
  const thruster = mesh(new THREE.ConeGeometry(0.07, 0.14, 12, 1, true), mat('#3a3f48', { side: THREE.DoubleSide }));
  thruster.position.y = -0.26; thruster.rotation.x = Math.PI; group.add(thruster);
  const plume = mesh(new THREE.ConeGeometry(0.05, 0.3, 12, 1, true), glow('#7fd0ff', 0.5));
  plume.position.y = -0.44; plume.rotation.x = Math.PI; group.add(plume);

  return {
    group,
    update(dt, t) { group.rotation.y += 0.45 * dt; plume.scale.y = 0.7 + Math.sin((t ?? 0) * 9) * 0.25; plume.material.opacity = 0.35 + Math.abs(Math.sin((t ?? 0) * 7)) * 0.3; },
    dispose() { disposeGroup(group); },
  };
}

/** A chemical rocket on the pad: stages, fins, an engine bell and a flame. */
export function createRocket(opts = {}) {
  const group = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.0, 24), mat('#e6e9ee', { roughness: 0.5, metalness: 0.2 }));
  group.add(body);
  const band = mesh(new THREE.CylinderGeometry(0.182, 0.182, 0.1, 24), mat('#c03a2a'));
  band.position.y = 0.18; group.add(band);
  const band2 = band.clone(); band2.position.y = -0.24; group.add(band2);
  const nose = mesh(new THREE.ConeGeometry(0.16, 0.34, 24), mat('#e6e9ee'));
  nose.position.y = 0.67; group.add(nose);
  const cap = mesh(new THREE.SphereGeometry(0.055, 14, 8), mat('#8fd0ff', { emissive: new THREE.Color('#2a5a80'), emissiveIntensity: 0.5 }));
  cap.position.y = 0.84; group.add(cap);
  for (let i = 0; i < 4; i++) {
    const fin = mesh(new THREE.BoxGeometry(0.02, 0.28, 0.2), mat('#c03a2a'));
    const a = (i / 4) * Math.PI * 2;
    fin.position.set(Math.cos(a) * 0.2, -0.42, Math.sin(a) * 0.2);
    fin.rotation.y = -a;
    group.add(fin);
  }
  const bell = mesh(new THREE.CylinderGeometry(0.1, 0.17, 0.2, 18, 1, true), mat('#4a5058', { side: THREE.DoubleSide, metalness: 0.7, roughness: 0.35 }));
  bell.position.y = -0.6; group.add(bell);
  const flame = mesh(new THREE.ConeGeometry(0.13, 0.6, 16, 1, true), glow('#ffb45a', 0.75));
  flame.position.y = -1.0; flame.rotation.x = Math.PI; group.add(flame);
  const core = mesh(new THREE.ConeGeometry(0.06, 0.34, 12, 1, true), glow('#ffffff', 0.85));
  core.position.y = -0.86; core.rotation.x = Math.PI; group.add(core);

  return {
    group,
    update(dt, t) {
      const f = 0.8 + Math.sin((t ?? 0) * 26) * 0.16 + Math.sin((t ?? 0) * 11) * 0.08;
      flame.scale.set(1, f, 1); core.scale.set(1, f * 1.1, 1);
      flame.material.opacity = 0.55 + f * 0.25;
      group.rotation.y += 0.25 * dt;
    },
    dispose() { disposeGroup(group); },
  };
}

/**
 * A crewed ship. kind: 'lander' (squat, legged), 'hauler' (spine with containers),
 * 'explorer' (sleek, swept wings). Anything else builds the explorer.
 */
export function createShip(kind = 'explorer', opts = {}) {
  const group = new THREE.Group();
  const glows = [];
  const engineGlow = (x, y, z, r, color = '#7fd0ff') => {
    const e = mesh(new THREE.CylinderGeometry(r, r * 1.1, 0.06, 14), glow(color, 0.9));
    e.rotation.x = Math.PI / 2; e.position.set(x, y, z);
    group.add(e); glows.push(e);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(color, 128, 0.45), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(r * 7); s.position.set(x, y, z - 0.05);
    group.add(s); glows.push(s);
  };

  if (kind === 'lander') {
    const hull = mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.34, 12), mat('#b0b6c0', { metalness: 0.5, roughness: 0.45 }));
    group.add(hull);
    const cockpit = mesh(new THREE.SphereGeometry(0.19, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat('#7fc8ff', { metalness: 0.3, roughness: 0.12, emissive: new THREE.Color('#20486a'), emissiveIntensity: 0.5 }));
    cockpit.position.y = 0.16; group.add(cockpit);
    const collar = mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 24), mat(TRIM, { metalness: 0.7 }));
    collar.rotation.x = Math.PI / 2; collar.position.y = 0.16; group.add(collar);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.42, 8), mat(HULL_DARK));
      leg.position.set(Math.cos(a) * 0.32, -0.3, Math.sin(a) * 0.32);
      leg.rotation.z = -Math.cos(a) * 0.45; leg.rotation.x = Math.sin(a) * 0.45;
      const foot = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 12), mat('#3f444d'));
      foot.position.set(Math.cos(a) * 0.42, -0.49, Math.sin(a) * 0.42);
      group.add(leg, foot);
    }
    engineGlow(0, -0.2, 0, 0.11, '#ffb45a');
  } else if (kind === 'hauler') {
    const spine = mesh(new THREE.BoxGeometry(0.12, 0.12, 1.5), mat(HULL_DARK, { metalness: 0.6, roughness: 0.4 }));
    group.add(spine);
    const bridge = mesh(new THREE.BoxGeometry(0.3, 0.2, 0.34), mat(HULL, { metalness: 0.45 }));
    bridge.position.z = 0.78; group.add(bridge);
    const window = mesh(new THREE.BoxGeometry(0.24, 0.07, 0.02), mat('#8fd0ff', { emissive: new THREE.Color('#4a90c0'), emissiveIntensity: 0.9 }));
    window.position.set(0, 0.04, 0.96); group.add(window);
    const colors = ['#8a5a3a', '#3a5a8a', '#5a7a4a', '#7a4a6a'];
    for (let i = 0; i < 6; i++) {
      const box = mesh(new THREE.BoxGeometry(0.26, 0.22, 0.2), mat(colors[i % colors.length], { roughness: 0.85 }));
      box.position.set(i % 2 ? 0.2 : -0.2, 0, 0.42 - Math.floor(i / 2) * 0.34);
      group.add(box);
    }
    const tank = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.4, 14), mat('#9aa2ae', { metalness: 0.6 }));
    tank.rotation.x = Math.PI / 2; tank.position.z = -0.5; group.add(tank);
    engineGlow(-0.13, 0, -0.78, 0.075); engineGlow(0.13, 0, -0.78, 0.075);
    group.add(navLight('#ff4444').translateY(0.16));
  } else {
    const fuse = mesh(new THREE.CapsuleGeometry(0.14, 0.7, 6, 16), mat(HULL, { metalness: 0.55, roughness: 0.3 }));
    fuse.rotation.x = Math.PI / 2; group.add(fuse);
    const nose = mesh(new THREE.ConeGeometry(0.14, 0.34, 16), mat('#dfe4ea', { metalness: 0.5 }));
    nose.rotation.x = Math.PI / 2; nose.position.z = 0.65; group.add(nose);
    const canopy = mesh(new THREE.SphereGeometry(0.1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), mat('#7fc8ff', { roughness: 0.1, metalness: 0.2, emissive: new THREE.Color('#20486a'), emissiveIntensity: 0.6 }));
    canopy.position.set(0, 0.09, 0.3); canopy.rotation.x = -0.3; group.add(canopy);
    for (const s of [-1, 1]) {
      const wing = mesh(new THREE.BoxGeometry(0.5, 0.02, 0.3), mat('#aab0ba', { metalness: 0.5 }));
      wing.position.set(s * 0.32, -0.02, -0.12);
      wing.rotation.y = s * 0.34; wing.rotation.z = s * -0.12;
      group.add(wing);
      const stripe = mesh(new THREE.BoxGeometry(0.46, 0.024, 0.06), mat(TRIM));
      stripe.position.set(s * 0.32, -0.01, -0.05); stripe.rotation.y = s * 0.34; stripe.rotation.z = s * -0.12;
      group.add(stripe);
      engineGlow(s * 0.18, -0.02, -0.46, 0.06);
    }
    const fin = mesh(new THREE.BoxGeometry(0.02, 0.24, 0.22), mat('#aab0ba'));
    fin.position.set(0, 0.14, -0.32); group.add(fin);
  }

  return {
    group, kind,
    update(dt, t) {
      group.rotation.y += 0.35 * dt;
      const f = 0.8 + Math.abs(Math.sin((t ?? 0) * 7)) * 0.4;
      for (const g of glows) { if (g.isSprite) g.scale.setScalar(g.scale.x * 0.98 + (0.42 * f) * 0.02); else g.material.opacity = 0.6 + f * 0.3; }
    },
    dispose() { disposeGroup(group); },
  };
}

/** An orbital station: a spinning habitat ring, a hub, docking arms and solar wings. */
export function createStation(opts = {}) {
  const group = new THREE.Group();
  const spinner = new THREE.Group();
  const ring = mesh(new THREE.TorusGeometry(0.7, 0.09, 14, 48), mat('#c2c8d2', { metalness: 0.6, roughness: 0.35 }));
  spinner.add(ring);
  // lit windows around the ring
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const win = mesh(new THREE.BoxGeometry(0.05, 0.035, 0.02), mat('#ffe6a8', { emissive: new THREE.Color('#ffcf6a'), emissiveIntensity: 1.1 }));
    win.position.set(Math.cos(a) * 0.7, Math.sin(a) * 0.7, 0.095);
    win.rotation.z = a;
    spinner.add(win);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const spoke = mesh(new THREE.BoxGeometry(0.05, 0.62, 0.05), mat(HULL_DARK, { metalness: 0.6 }));
    spoke.position.set(Math.cos(a) * 0.35, Math.sin(a) * 0.35, 0);
    spoke.rotation.z = a - Math.PI / 2;
    spinner.add(spoke);
  }
  spinner.rotation.x = Math.PI / 2;
  group.add(spinner);

  const hub = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.5, 18), mat('#aeb4be', { metalness: 0.6, roughness: 0.35 }));
  group.add(hub);
  const capTop = mesh(new THREE.SphereGeometry(0.17, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat('#cdd3dc'));
  capTop.position.y = 0.25; group.add(capTop);
  const capBot = capTop.clone(); capBot.position.y = -0.25; capBot.rotation.x = Math.PI; group.add(capBot);

  for (const s of [-1, 1]) {
    const arm = mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), mat(HULL_DARK));
    arm.position.set(0, s * 0.3, 0.3); group.add(arm);
    const clamp2 = mesh(new THREE.TorusGeometry(0.1, 0.022, 8, 18), mat(TRIM, { metalness: 0.7 }));
    clamp2.position.set(0, s * 0.3, 0.56); group.add(clamp2);
    const wing = solarPanel(0.34, 0.7); wing.position.set(s * 0.62, 0, -0.35); wing.rotation.y = Math.PI / 2;
    group.add(wing);
  }
  const beacon = navLight('#ff4444', 0.03); beacon.position.y = 0.42; group.add(beacon);
  const beacon2 = navLight('#4affa0', 0.03); beacon2.position.set(0, 0, 0.66); group.add(beacon2);

  return {
    group, spinner,
    update(dt, t) {
      spinner.rotation.z += 0.28 * dt;
      group.rotation.y += 0.06 * dt;
      const on = Math.sin((t ?? 0) * 3) > 0.4;
      beacon.material.opacity = on ? 1 : 0.15;
      beacon2.material.opacity = on ? 0.2 : 1;
    },
    dispose() { disposeGroup(group); },
  };
}

// ---------------------------------------------------------------------------- backdrop

/**
 * The sky: a sphere of points for stars, plus a few soft nebula sprites.
 * opts: { stars, radius, nebula (count), colors, seed }
 */
export function createSpaceBackdrop(opts = {}) {
  const { stars = 2200, radius = 300, nebula = 3, seed = 1, colors = ['#6a4ad0', '#2a6ad0', '#d04a7a', '#3ad0c0'] } = opts;
  const group = new THREE.Group();
  const rng = makeRng(subSeed(seed, 'backdrop'));

  const pos = new Float32Array(stars * 3), col = new Float32Array(stars * 3), sizes = new Float32Array(stars);
  const tint = new THREE.Color();
  for (let i = 0; i < stars; i++) {
    // even spread over the sphere
    const u = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pos[i * 3] = Math.cos(a) * r * radius; pos[i * 3 + 1] = u * radius; pos[i * 3 + 2] = Math.sin(a) * r * radius;
    const warm = rng();
    tint.setHSL(warm < 0.72 ? 0.58 + rng() * 0.06 : 0.07 + rng() * 0.06, 0.35 + rng() * 0.4, 0.72 + rng() * 0.28);
    col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b;
    sizes[i] = radius * (0.0015 + Math.pow(rng(), 6) * 0.012);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: radius * 0.006, sizeAttenuation: true, vertexColors: true, transparent: true,
    map: glowSprite('#ffffff', 64, 0.35), alphaTest: 0.02, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  group.add(points);

  for (let i = 0; i < nebula; i++) {
    const c = colors[i % colors.length];
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(c, 512, 0.85), transparent: true, opacity: 0.16 + rng() * 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    const u = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    s.position.set(Math.cos(a) * r * radius * 0.85, u * radius * 0.6, Math.sin(a) * r * radius * 0.85);
    s.scale.setScalar(radius * rng.range(0.35, 0.8));
    group.add(s);
  }

  return {
    group, points,
    update(dt) { group.rotation.y += 0.004 * dt; },
    dispose() { disposeGroup(group); },
  };
}

// ---------------------------------------------------------------------------- index

/** Every builder, by the id used in assets/data/manifest.json. */
export const SPACE_MODELS = {
  planet: createPlanet,
  star: createStar,
  asteroid_belt: createAsteroidBelt,
  satellite: createSatellite,
  probe: createProbe,
  rocket: createRocket,
  ship_lander: (o = {}) => createShip('lander', o),
  ship_hauler: (o = {}) => createShip('hauler', o),
  ship_explorer: (o = {}) => createShip('explorer', o),
  station: createStation,
  space_backdrop: createSpaceBackdrop,
};

export const SPACE_MODEL_IDS = Object.keys(SPACE_MODELS);

/**
 * Build one by id. `opts` goes straight to the builder; `planet` and `star` take their record from
 * opts.planet / opts.star so every model can be built the same way from a manifest entry.
 */
export function createSpaceModel(id, opts = {}) {
  if (id === 'planet') return createPlanet(opts.planet || {}, opts);
  if (id === 'star') return createStar(opts.star || {}, opts);
  const fn = SPACE_MODELS[id];
  if (!fn) throw new Error('unknown space model: ' + id);
  return fn(opts);
}
