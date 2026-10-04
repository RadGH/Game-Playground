// Renderer, sky, light and fog. One sun that follows the player so its shadow box stays tight and
// sharp wherever you walk, a hemisphere fill so shade is never black, a sky dome whose horizon colour
// IS the fog colour (so distant hills melt into the sky instead of ending at a grey wall).

import * as THREE from 'three';

export function createScene(canvas, { quality = 'high' } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(quality === 'low' ? Math.min(1, window.devicePixelRatio || 1) * 0.75 : Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2400);

  const SKY = { zenith: new THREE.Color('#3f6fb3'), horizon: new THREE.Color('#c9d9e6'), ground: new THREE.Color('#6d7a6a') };
  scene.fog = new THREE.Fog(SKY.horizon.clone(), 140, 900);
  scene.background = SKY.horizon.clone();

  // Sky dome: a big inside-out sphere with a gradient and a soft sun glow. Not affected by fog.
  const sunDir = new THREE.Vector3(-0.45, 0.62, -0.64).normalize();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uZenith: { value: SKY.zenith }, uHorizon: { value: SKY.horizon }, uGround: { value: SKY.ground }, uSun: { value: sunDir } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      uniform vec3 uZenith, uHorizon, uGround, uSun; varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 c = h > 0.0 ? mix(uHorizon, uZenith, pow(clamp(h,0.0,1.0), 0.55)) : mix(uHorizon, uGround, clamp(-h*3.0,0.0,1.0));
        float s = max(dot(normalize(vDir), uSun), 0.0);
        c += vec3(1.0,0.9,0.7) * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);

  // Soft cloud band: a few flattened, faint sprites high up so the sky is not a flat gradient.
  const clouds = new THREE.Group();
  const cloudTex = makeCloudSprite();
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
    const a = (i / 26) * Math.PI * 2 + Math.sin(i * 7.1) * 0.3, r = 900 + (i % 5) * 140;
    m.position.set(Math.cos(a) * r, 230 + (i % 7) * 35, Math.sin(a) * r);
    m.scale.set(420 + (i % 4) * 130, 120 + (i % 3) * 40, 1);
    clouds.add(m);
  }
  scene.add(clouds);

  const hemi = new THREE.HemisphereLight('#d6e6ff', '#6b5f48', 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d8', 2.6);
  sun.castShadow = renderer.shadowMap.enabled;
  sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  const S = 46;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 260 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  /** Keep the sun and its shadow box centred on `p` (snapped to texels so shadows do not shimmer). */
  function follow(p) {
    const texel = (S * 2) / sun.shadow.mapSize.x;
    const cx = Math.round(p.x / texel) * texel, cz = Math.round(p.z / texel) * texel;
    sun.target.position.set(cx, p.y, cz);
    sun.position.set(cx + sunDir.x * 140, p.y + sunDir.y * 140, cz + sunDir.z * 140);
    sky.position.set(p.x, 0, p.z);
    lantern.position.set(p.x, p.y + 2.4, p.z);
    clouds.position.set(p.x * 0.9, 0, p.z * 0.9);
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  /** 'outdoor' (sky, sun, long fog) or 'dungeon' (no sky, dim cold fill, close dark fog). */
  function setMood(mood) {
    const dark = mood === 'dungeon';
    sky.visible = clouds.visible = !dark;
    scene.background = dark ? new THREE.Color('#06050a') : SKY.horizon.clone();
    scene.fog.color.set(dark ? '#06050a' : SKY.horizon);
    scene.fog.near = dark ? 10 : 140; scene.fog.far = dark ? 48 : 900;
    hemi.intensity = dark ? 0.62 : 1.15; hemi.color.set(dark ? '#8f9cc0' : '#d6e6ff'); hemi.groundColor.set(dark ? '#2a2018' : '#6b5f48');
    sun.intensity = dark ? 0.25 : 2.6;
    lantern.visible = dark;
  }
  // The light you carry underground: warm, close, follows you (placed in follow()).
  const lantern = new THREE.PointLight('#ffc98a', 9, 13, 1.6);
  lantern.visible = false; scene.add(lantern);

  return { renderer, scene, camera, sun, hemi, sunDir, follow, resize, setMood, render: () => renderer.render(scene, camera) };
}

function makeCloudSprite() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 18; i++) {
    const x = 40 + Math.random() * 176, y = 45 + Math.random() * 40, r = 22 + Math.random() * 30;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
