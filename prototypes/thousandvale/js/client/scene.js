// Renderer, sky, light and fog. One sun that follows the player so its shadow box stays tight and
// sharp wherever you walk, a hemisphere fill so shade is never black, a sky dome whose horizon colour
// IS the fog colour (so distant hills melt into the sky instead of ending at a grey wall).

import * as THREE from 'three';
import { skyAt, carriedLight, DUNGEON_AMBIENT } from './daynight.js';
import { createSkyBox } from './sky-box.js';           // Z59: the painted sky
import { skyPlan } from './sky-plan.js';

export function createScene(canvas, { quality = 'high' } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(quality === 'low' ? Math.min(1, window.devicePixelRatio || 1) * 0.75 : Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  // far enough for the horizon (the whole world from the macro bake, ~36 km across); near pulled out a little
  // so the depth buffer still separates a boot from the ground at 200 m.
  const camera = new THREE.PerspectiveCamera(55, 1, 0.25, 22000);

  const SKY = { zenith: new THREE.Color('#3f6fb3'), horizon: new THREE.Color('#c9d9e6'), ground: new THREE.Color('#6d7a6a') };
  scene.fog = new THREE.Fog(SKY.horizon.clone(), 220, 7000);
  scene.background = SKY.horizon.clone();

  // Sky dome: a big inside-out sphere with a gradient and a soft sun glow. Not affected by fog.
  const sunDir = new THREE.Vector3(-0.45, 0.62, -0.64).normalize();
  const keyDir = sunDir.clone(), moonDir = new THREE.Vector3(0.4, 0.6, 0.3).normalize();
  let mood = 'outdoor', lastSky = null;
  // play-test 11 (Z59, live #60): the painted sky (sky-box.js) replaces the gradient dome; the gradient below is kept as
  // the fallback the box draws until its first picture has loaded
  const skyBox = createSkyBox({ base: new URL('../../assets/sky/', import.meta.url), gradient: SKY });
  const skyCtx = { province: null, day: 0 };
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
  const sky = skyBox.mesh;      // (skyMat, the old gradient, is kept only as the fallback's reference; it is never drawn)
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

  // Stars and a moon for the night (fade in with skyAt().stars). Fixed to the camera like the dome.
  const starGeo = new THREE.BufferGeometry();
  { const p = []; let sd = 7; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 900; i++) { const u = r() * 2 - 1, a = r() * Math.PI * 2, y = Math.abs(u) * 0.95 + 0.05, h = Math.sqrt(1 - y * y); p.push(Math.cos(a) * h * 1800, y * 1800, Math.sin(a) * h * 1800); }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); }
  const starMat = new THREE.PointsMaterial({ color: '#dfe8ff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new THREE.Points(starGeo, starMat); stars.frustumCulled = false; stars.renderOrder = -9; stars.visible = false;
  scene.add(stars);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeMoonSprite(), color: '#e8eeff', transparent: true, depthWrite: false, fog: false, opacity: 0 }));
  moon.scale.set(110, 110, 1); moon.renderOrder = -8; moon.visible = false; scene.add(moon);

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
    sun.position.set(cx + keyDir.x * 140, p.y + keyDir.y * 140, cz + keyDir.z * 140);
    sky.position.set(p.x, 0, p.z);
    stars.position.set(p.x, 0, p.z);
    moon.position.set(p.x + moonDir.x * 1700, moonDir.y * 1700, p.z + moonDir.z * 1700);
    lantern.position.set(p.x, p.y + 2.4, p.z);
    clouds.position.set(p.x * 0.9, 0, p.z * 0.9);
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  // Safari's toolbars can resize the canvas without a window resize event.
  new ResizeObserver(resize).observe(canvas);
  window.visualViewport?.addEventListener('resize', resize);
  resize();

  /** 'outdoor' (sky, sun, long fog) or 'dungeon' (no sky, dim cold fill, close dark fog). */
  function setMood(m, { fog = '#06050a', bright = false } = {}) {
    mood = m;
    const dark = mood === 'dungeon';
    sky.visible = clouds.visible = !dark;
    if (!dark && skyBox.ready) clouds.visible = false;
    scene.background = dark ? new THREE.Color(fog) : SKY.horizon.clone();
    scene.fog.color.set(dark ? fog : SKY.horizon);
    // play-test 8 (W22): a dungeon is never pitch black — a floor of ambient light under every look, fog pushed back
    scene.fog.near = dark ? (bright ? DUNGEON_AMBIENT.fogNearBright : DUNGEON_AMBIENT.fogNear) : 140; scene.fog.far = dark ? (bright ? DUNGEON_AMBIENT.fogFarBright : DUNGEON_AMBIENT.fogFar) : 900;
    hemi.intensity = dark ? (bright ? DUNGEON_AMBIENT.hemiBright : DUNGEON_AMBIENT.hemi) * ambientK : 1.15; hemi.color.set(dark ? '#9aa6c8' : '#d6e6ff'); hemi.groundColor.set(dark ? '#3a2e24' : '#6b5f48');
    sun.intensity = dark ? 0.35 : 2.6;
    // never toggle a light's visibility (every lit material would recompile: the P1/P10 freeze) — dim it instead
    moodBright = bright; applyCarry();
    stars.visible = moon.visible = false;
    if (!dark && lastSky) applySky(lastSky);
  }

  /** Time of day (0 = midnight, 0.5 = noon; the realm clock): sun or moon, sky, fog, light, stars. */
  function setTimeOfDay(t) {
    const k = skyAt(t);
    lastSky = k;
    if (mood === 'outdoor') applySky(k);
    return k;
  }
  /** Z59: where the sky is (a province key — Vharlen has its own) and which realm day (the weather comes from it). */
  function setSkyContext({ province = skyCtx.province, day = skyCtx.day } = {}) {
    const changed = province !== skyCtx.province || day !== skyCtx.day;
    skyCtx.province = province; skyCtx.day = day;
    if (changed && lastSky && mood === 'outdoor') applySky(lastSky);
    return changed;
  }
  const _c = new THREE.Color();
  function applySky(k) {
    SKY.zenith.setRGB(...k.zenith); SKY.horizon.setRGB(...k.horizon); SKY.ground.setRGB(...k.ground);
    // Z59: the painted sky for this hour, place and weather; the fog takes the painting's own horizon colour, written as
    // display values (three adds fog after tone mapping, so a fogged hill shows exactly this colour)
    const plan = skyPlan(k.t, skyCtx);
    skyBox.setPlan(plan); lastPlan = plan;
    const f = skyBox.fog;
    if (f) scene.fog.color.setRGB(f[0], f[1], f[2], THREE.LinearSRGBColorSpace);
    else { scene.fog.color.copy(SKY.horizon); skyBox.setFallbackFog([scene.fog.color.r, scene.fog.color.g, scene.fog.color.b]); }
    scene.background = scene.fog.color.clone();
    scene.fog.near = k.fogNear; scene.fog.far = k.fogFar * (plan.weather === 'cloudy' && plan.stage === 'day' ? 0.85 : 1);
    clouds.visible = !skyBox.ready;
    sunDir.set(...k.sun); keyDir.set(...k.keyDir);
    moonDir.set(-k.sun[0], Math.max(0.25, -k.sun[1]), -k.sun[2]).normalize();
    skyMat.uniforms.uSun.value.copy(k.night > 0.6 ? moonDir : sunDir);
    skyBox.setSun(k.night > 0.6 ? moonDir : sunDir, k.night > 0.6 ? 0.18 : Math.max(0.15, 1 - k.night));
    sun.color.setRGB(...k.keyColor); sun.intensity = k.keyIntensity;
    hemi.color.setRGB(...k.hemiSky); hemi.groundColor.setRGB(...k.hemiGround); hemi.intensity = k.hemiIntensity;
    renderer.toneMappingExposure = k.exposure;
    starMat.opacity = k.stars * 0.9; stars.visible = k.stars > 0.02;
    moon.visible = k.night > 0.2; moon.material.opacity = Math.min(1, k.night * 1.3);
    for (const c of clouds.children) c.material.color.copy(_c.setRGB(...k.horizon).lerp(new THREE.Color('#ffffff'), 0.55));
    if (skyBox.ready) { starMat.opacity = k.stars * 0.55; }       // the night picture has its own stars; the points add a crisp few
  }
  let lastPlan = null;
  // a picture that arrives after the clock last ticked: apply it at once (not half a second later, grey)
  skyBox.manifest.then(() => setTimeout(() => { if (lastSky && mood === 'outdoor') applySky(lastSky); }, 0));
  // The light everyone carries (W22): warm, follows you (placed in follow()); underground always, outdoors as night falls.
  // ONE PointLight that is always in the scene and only ever dimmed — adding, removing or hiding a light recompiles every lit material.
  const lantern = new THREE.PointLight('#ffc98a', 9, 13, 1.6);
  lantern.intensity = 0; scene.add(lantern);
  let moodBright = false, carryRange = null, carryNight = 0, carryDungeon = null, ambientK = 1;
  function applyCarry() {
    const c = carriedLight({ mood, night: carryNight, range: carryRange, bright: moodBright, dungeonRange: carryDungeon });
    lantern.intensity = c.intensity; lantern.distance = c.distance; lantern.decay = c.decay;
    return c;
  }
  /** W22: how dark it is (0..1) and the rules' light radius in metres (null = the client's own). */
  function setCarryLight({ night = carryNight, range = carryRange, dungeonRange = carryDungeon, dungeonAmbient = null } = {}) {
    carryNight = night; carryRange = range; carryDungeon = dungeonRange;
    // C's `dungeonAmbient` (0.4 of daylight) is what our floor was tuned at: a different number scales the floor with it
    if (Number.isFinite(dungeonAmbient) && dungeonAmbient > 0) { ambientK = Math.max(0.6, Math.min(2, dungeonAmbient / 0.4)); if (mood === 'dungeon') hemi.intensity = (moodBright ? DUNGEON_AMBIENT.hemiBright : DUNGEON_AMBIENT.hemi) * ambientK; }
    return applyCarry();
  }

  return { renderer, scene, camera, sun, hemi, sunDir, follow, resize, setMood, setTimeOfDay, setSkyContext, skyBox, get skyPlan() { return lastPlan; }, setCarryLight, get carry() { return { intensity: lantern.intensity, distance: lantern.distance, hemi: hemi.intensity, fogNear: scene.fog.near, fogFar: scene.fog.far }; }, get sky() { return lastSky; }, render: () => renderer.render(scene, camera) };
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

function makeMoonSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.36, 'rgba(240,244,255,1)'); grd.addColorStop(0.42, 'rgba(200,215,255,0.35)'); grd.addColorStop(1, 'rgba(160,180,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(170,180,205,0.45)';
  for (const [x, y, r] of [[54, 56, 7], [72, 70, 5], [66, 48, 4], [50, 74, 3]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
