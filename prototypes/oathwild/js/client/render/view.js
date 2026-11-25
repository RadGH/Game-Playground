// The 3D view: renderer, scene, sky, sun and fog, the camera, resizing, and the graphics quality setting.
// Warm, colourful, readable (PLAN §0 tone): a painted sky (gradient, sun and glow, drifting clouds), a warm sun with soft
// shadows that do not crawl, a cool sky fill, fog the colour of the horizon. Lights are made once and never toggled
// (lessons rule 29: no shader rebuilds mid-game); quality changes the pixel ratio, the shadow map and the view distance only.
import * as THREE from 'three';
import { installAtmos, ATMOS } from './atmos.js';
import { createPost } from './post.js';

installAtmos();   // height mist + cloud shadows on every fogged material (before any of them compiles)
// ?envoff: this round's look switched off (old sun, no sky light, no after-effects, no mist / cloud shade / hills) — for
// before/after pictures and for telling whether a problem comes from the new look
export const ENV_OFF = new URLSearchParams(location.search).has('envoff');

export const QUALITY = {
  low: { pixel: 0.75, shadows: false, far: 220, shadowSize: 0, shadowBox: 40, soft: false, trees: 0.55, decor: 0.4 },
  medium: { pixel: 1, shadows: true, far: 300, shadowSize: 1024, shadowBox: 42, soft: false, trees: 0.85, decor: 0.75 },
  high: { pixel: 1.5, shadows: true, far: 380, shadowSize: 4096, shadowBox: 80, soft: true, trees: 1, decor: 1 },   // wider shadow reach instead of cascades (CSM replaces material hooks + one pass per cascade)
};
// a warm late-morning: the sun's direction (towards it), its colour, and the sky's three bands; fog = the horizon band
export const SKY = {
  // late afternoon (environment round 2026-11-24): the sun ~28° up, warmer — long shadows give everything shape
  sun: ENV_OFF ? [0.62, 0.62, 0.48] : [0.7, 0.47, 0.54], sunColour: ENV_OFF ? '#ffe0b0' : '#ffd6a4', top: '#3f7fd0', mid: '#8fbbe6', horizon: '#d3dde2', glow: '#ffe6c0',
  cloud: '#ffffff', cloudShade: '#c4cfdc', ground: '#d7dccf',
};

/** Exposure and the image-based light's share (checked on screenshots: enough to round shapes, never milky). */
export const TONE = ENV_OFF ? { exposure: 1.0, envLight: 0, hemi: 1.15, sun: 2.7 } : { exposure: 1.0, envLight: 0.3, hemi: 1.0, sun: 2.9 };

export function createView(canvas, { quality = 'medium' } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const tone = new URLSearchParams(location.search).get('tone');
  renderer.toneMapping = tone === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = TONE.exposure;
  // PCF for every setting (r186 dropped PCFSoft); High softens it with a wider filter radius (sun.shadow.radius)
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const fogColour = new THREE.Color(SKY.horizon);
  scene.fog = new THREE.Fog(fogColour, 90, 300);
  scene.background = fogColour.clone();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.2, 900);
  const sunDir = new THREE.Vector3(...SKY.sun).normalize();

  // sky: a dome painted in the shader — deep blue overhead to a warm haze at the horizon, the sun with a soft glow, and
  // slow drifting clouds (two octaves of value noise projected on a flat cloud layer; thinner towards the horizon)
  const skyGeo = new THREE.SphereGeometry(1, 32, 16);              // scaled to just inside the far plane (setQuality)
  const skyU = {
    top: { value: new THREE.Color(SKY.top) }, mid: { value: new THREE.Color(SKY.mid) }, low: { value: fogColour }, below: { value: new THREE.Color(SKY.ground) },
    glow: { value: new THREE.Color(SKY.glow) }, sunCol: { value: new THREE.Color(SKY.sunColour) }, sunDir: { value: sunDir },
    cloud: { value: new THREE.Color(SKY.cloud) }, cloudShade: { value: new THREE.Color(SKY.cloudShade) }, time: { value: 0 },
  };
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform vec3 top, mid, low, below, glow, sunCol, sunDir, cloud, cloudShade; uniform float time; varying vec3 vP;
      float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hs(i), hs(i + vec2(1, 0)), f.x), mix(hs(i + vec2(0, 1)), hs(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.0, w = 0.55; for (int i = 0; i < 4; i++) { a += vn(p) * w; p = p * 2.03 + 7.7; w *= 0.5; } return a; }
      void main(){
        vec3 d = normalize(vP); float h = d.y;
        vec3 c = h > 0.0 ? mix(low, mid, smoothstep(0.0, 0.22, h)) : mix(low, below, 1.0 - smoothstep(-0.12, 0.0, h));
        c = mix(c, top, smoothstep(0.18, 0.85, h));
        float s = max(dot(d, sunDir), 0.0);
        c = mix(c, glow, pow(s, 6.0) * 0.45 * (1.0 - smoothstep(0.3, 0.9, h)) + pow(s, 24.0) * 0.35);
        if (h > 0.015) {
          vec2 cp = d.xz / (h + 0.12) * 1.6 + vec2(time * 0.006, time * 0.0025);
          float n = fbm(cp);
          float cov = smoothstep(0.52, 0.78, n) * smoothstep(0.015, 0.2, h);
          float lit = 0.75 + 0.25 * smoothstep(0.5, 0.9, fbm(cp + sunDir.xz * 0.08));
          vec3 cc = mix(cloudShade, cloud, lit) + glow * pow(s, 8.0) * 0.3;
          c = mix(c, cc, cov * 0.85);
        }
        c += sunCol * (smoothstep(0.9985, 0.9993, s) * 1.6 + pow(s, 600.0) * 0.6);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  // distant hills (environment round): two rings of soft ridges just inside the far plane, following you like the sky,
  // coloured as air-faded blue-grey (no fog on them: they are already the colour fog would make them), so the land seems
  // to go on past the fog instead of stopping at a wall
  const hills = new THREE.Group(); hills.renderOrder = -9;
  {
    const ridge = (radius, seed, lo, hi, colour) => {
      const N = 160, pos = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const n = Math.sin(a * 3 + seed) * 0.5 + Math.sin(a * 7.3 + seed * 2.1) * 0.3 + Math.sin(a * 17.1 + seed * 0.7) * 0.2;
        const h = lo + (hi - lo) * (0.5 + 0.5 * n);
        pos.push(Math.sin(a) * radius, -40, Math.cos(a) * radius, Math.sin(a) * radius, h, Math.cos(a) * radius);
        if (i < N) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: colour, fog: false, side: THREE.DoubleSide, depthWrite: false }));
      m.frustumCulled = false; m.renderOrder = -9; return m;
    };
    hills.add(ridge(1, 1.3, 0.03, 0.09, new THREE.Color(SKY.horizon).lerp(new THREE.Color('#7f97ad'), 0.38)));
    hills.add(ridge(0.93, 4.1, 0.015, 0.055, new THREE.Color(SKY.horizon).lerp(new THREE.Color('#6f8a86'), 0.5)));
  }
  hills.visible = !ENV_OFF;
  scene.add(hills);

  // light: a cool sky fill from above with warm bounce from the ground, and a warm, strong sun for shape and shadow
  // the cool sky fill is smaller now that the sky itself lights things (scene.environment, below)
  const hemi = new THREE.HemisphereLight('#bcd2ee', '#6e6040', TONE.hemi);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(SKY.sunColour, TONE.sun);
  sun.castShadow = true;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
  scene.add(sun); scene.add(sun.target);
  // image-based light from OUR sky (the same painted dome, baked once into a light map): the shiny and rough materials
  // pick up blue from above and warm haze from the horizon, so props and heroes sit in the same air as the sky you see.
  // Baked from the sky rather than a downloaded photo so the light always matches what is on screen and costs no download.
  {
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(skyGeo, skyMat); envSky.scale.setScalar(50); envScene.add(envSky);
    const rt = pm.fromScene(envScene, 0.04, 0.1, 100);
    scene.environment = rt.texture; scene.environmentIntensity = TONE.envLight;
    pm.dispose();
  }
  let shadowBox = 42, clock = 0, post = null;
  const ORIGIN = new THREE.Vector3(), snap = new THREE.Vector3(), lightSpace = new THREE.Matrix4(), inv = new THREE.Matrix4();

  const view = {
    renderer, scene, camera, sun, hemi, sky, hills, sunDir, quality: null, size: { w: 1, h: 1 },
    setQuality(q) {
      const Q = QUALITY[q] || QUALITY.medium;
      view.quality = q in QUALITY ? q : 'medium';
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, Q.pixel * (devicePixelRatio > 1 ? 1.4 : 1)));
      renderer.shadowMap.enabled = Q.shadows;
      sun.castShadow = Q.shadows;
      if (Q.shadows) { sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize); sun.shadow.map?.dispose(); sun.shadow.map = null; }
      shadowBox = Q.shadowBox;
      const sc = sun.shadow.camera;
      sc.left = -shadowBox; sc.right = shadowBox; sc.top = shadowBox; sc.bottom = -shadowBox; sc.near = 10; sc.far = 320; sc.updateProjectionMatrix();
      sun.shadow.radius = Q.soft ? 3 : 1;
      scene.fog.near = Q.far * 0.3; scene.fog.far = Q.far;
      camera.far = Q.far + 60; camera.updateProjectionMatrix();
      sky.scale.setScalar(camera.far * 0.9);
      hills.scale.setScalar(camera.far * 0.84);
      post?.dispose(); post = ENV_OFF ? null : createPost(view, view.quality); view.post = post;
      view.resize();
    },
    resize() {
      const w = innerWidth, h = innerHeight;
      view.size = { w, h };
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.fov = w < h ? 72 : 62;                    // portrait phones see a little wider
      camera.updateProjectionMatrix();
      post?.setSize(w, h);
    },
    /** Keep the sun's shadow box and the sky on the player. */
    follow(x, y, z) {
      // the shadow box moves in whole shadow-map texels (seen from the sun), so shadow edges do not crawl as you walk
      const texel = (shadowBox * 2) / Math.max(256, sun.shadow.mapSize.x);
      lightSpace.lookAt(sunDir, ORIGIN, THREE.Object3D.DEFAULT_UP); inv.copy(lightSpace).invert();
      snap.set(x, y, z).applyMatrix4(inv);
      snap.x = Math.round(snap.x / texel) * texel; snap.y = Math.round(snap.y / texel) * texel;
      snap.applyMatrix4(lightSpace);
      sun.target.position.copy(snap);
      sun.position.copy(snap).addScaledVector(sunDir, 150);
      sky.position.set(x, 0, z);
      hills.position.set(x, y - 6, z);
    },
    tuning: null,                                     // app.tuning (data/tuning.json, the Look group): read every frame
    /** The Look numbers from the tuning panel, applied live (uniform and value sets only: nothing recompiles). */
    applyLook(L) {
      if (!L || L.lookExposure == null || ENV_OFF) return;
      renderer.toneMappingExposure = L.lookExposure; scene.environmentIntensity = L.lookSkyLight; sun.intensity = L.lookSun; hemi.intensity = L.lookFill;
      ATMOS.set({ mist: { density: L.lookMist, max: L.lookMistMax }, cloud: { strength: L.lookClouds, scale: L.lookCloudSize } });
      if (post) {
        post.bloom.strength = L.lookBloom; post.bloom.threshold = L.lookBloomCut; post.bloom.enabled = L.lookBloom > 0;
        const g = post.grade;
        g.uWarm.value.set(1 + L.lookWarm, 1, 1 - L.lookWarm * 1.5); g.uCool.value.set(1 - L.lookCool, 1 - L.lookCool * 0.15, 1 + L.lookCool);
        g.uGreen.value = L.lookGreenCalm; g.uSat.value = L.lookSaturation; g.uCon.value = L.lookContrast; g.uLift.value = L.lookLift; g.uVig.value = L.lookVignette;
      }
    },
    render() { clock += 1 / 60; skyU.time.value = clock; ATMOS.tick(clock); view.applyLook(view.tuning); if (post) { post.sun(sunDir); post.render(); } else renderer.render(scene, camera); },
  };
  if (ENV_OFF) ATMOS.set({ cloud: { strength: 0 }, mist: { density: 0 } });
  addEventListener('resize', () => view.resize());
  view.setQuality(quality);
  return view;
}
