// Sky, sun, moon, clouds, stars, and every colour that depends on the time of day.
//
// This module owns the mood. It decides where the sun is, what colour its light is, how thick the
// haze is, what the sky dome looks like and what the world's reflections are lit by. Everything
// else in the experiment just reads the numbers it publishes.
//
// The sky dome itself is three's physical sky (Preetham/Hosek-style atmospheric scattering). The
// useful part is that we can also point a reflection probe at it, so a wet rock at dusk reflects an
// actual dusk sky rather than a grey ball — which is most of what separates "lit" from "shaded".

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CSM } from 'three/addons/csm/CSM.js';
import { SHARED } from './materials.js';
import { makeCloudTexture } from './kit/textures.js';

/** Weather presets. Each one is a whole look, not a single slider. */
export const WEATHER = {
  clear:    { label: 'Clear',        turbidity: 2.6,  rayleigh: 1.4, mie: 0.004, mieG: 0.80, fog: 0.0032, fogHeight: 85, clouds: 0.22, cloudSpeed: 0.010, sun: 1.00, ambient: 1.00, sat: 1.04 },
  golden:   { label: 'Golden hour',  turbidity: 5.2,  rayleigh: 2.4, mie: 0.010, mieG: 0.86, fog: 0.0070, fogHeight: 55, clouds: 0.34, cloudSpeed: 0.012, sun: 0.95, ambient: 0.95, sat: 1.10 },
  hazy:     { label: 'Hazy',         turbidity: 7.0,  rayleigh: 2.0, mie: 0.014, mieG: 0.82, fog: 0.0130, fogHeight: 42, clouds: 0.42, cloudSpeed: 0.014, sun: 0.82, ambient: 1.05, sat: 0.96 },
  overcast: { label: 'Overcast',     turbidity: 11.0, rayleigh: 0.9, mie: 0.020, mieG: 0.70, fog: 0.0240, fogHeight: 34, clouds: 0.88, cloudSpeed: 0.020, sun: 0.34, ambient: 1.35, sat: 0.84 },
  fogbank:  { label: 'Deep fog',     turbidity: 9.0,  rayleigh: 1.2, mie: 0.022, mieG: 0.76, fog: 0.0520, fogHeight: 22, clouds: 0.60, cloudSpeed: 0.008, sun: 0.48, ambient: 1.25, sat: 0.78 },
  storm:    { label: 'Storm front',  turbidity: 14.0, rayleigh: 0.7, mie: 0.028, mieG: 0.66, fog: 0.0300, fogHeight: 30, clouds: 1.00, cloudSpeed: 0.045, sun: 0.22, ambient: 1.20, sat: 0.80 },
};

/**
 * Colour keyframes through the day. Everything between these hours is interpolated, which is why
 * dawn slides through orange into white instead of snapping.
 *   sun      — the colour of direct sunlight
 *   ground   — the haze colour low down (what distant hills wash out to)
 *   sky      — the haze colour high up
 *   inscatter— the glow you get looking toward the sun through the haze
 *   ambientS — hemisphere light, sky side;  ambientG — hemisphere light, ground side
 */
const DAY_TABLE = [
  { h: 0.0,  sun: 0x2a3550, sunI: 0.05, ground: 0x2a3244, sky: 0x1b2438, inscatter: 0x3d4a66, ambS: 0x2c3a58, ambG: 0x1a1d24, ambI: 0.28, exposure: 0.62 },
  { h: 4.5,  sun: 0x3a4262, sunI: 0.08, ground: 0x3b4159, sky: 0x232e46, inscatter: 0x59567a, ambS: 0x3a4566, ambG: 0x20242e, ambI: 0.34, exposure: 0.66 },
  { h: 6.0,  sun: 0xff8a52, sunI: 0.55, ground: 0xb08a80, sky: 0x6b7ea8, inscatter: 0xff9c5e, ambS: 0x7f93c0, ambG: 0x3c342e, ambI: 0.55, exposure: 0.84 },
  { h: 7.5,  sun: 0xffc48a, sunI: 1.55, ground: 0xc6c0b4, sky: 0x93aece, inscatter: 0xffd9a0, ambS: 0x9fb6da, ambG: 0x4d463a, ambI: 0.72, exposure: 0.96 },
  { h: 10.0, sun: 0xfff0d8, sunI: 2.65, ground: 0xc8d2d8, sky: 0xa8c4e2, inscatter: 0xfff0cf, ambS: 0xb2cbe8, ambG: 0x5a5648, ambI: 0.86, exposure: 1.00 },
  { h: 13.0, sun: 0xfffaf0, sunI: 3.05, ground: 0xcfd8dd, sky: 0xaecae8, inscatter: 0xfff8e4, ambS: 0xbad2ec, ambG: 0x5f5b4c, ambI: 0.92, exposure: 1.00 },
  { h: 16.0, sun: 0xfff0cf, sunI: 2.45, ground: 0xcdd0cb, sky: 0xa6c0de, inscatter: 0xffeec4, ambS: 0xb0c8e6, ambG: 0x5b554a, ambI: 0.84, exposure: 0.99 },
  { h: 18.3, sun: 0xffab63, sunI: 1.25, ground: 0xc9a88e, sky: 0x8296bc, inscatter: 0xffb872, ambS: 0x94a8ce, ambG: 0x4a4038, ambI: 0.66, exposure: 0.92 },
  { h: 19.6, sun: 0xff7842, sunI: 0.42, ground: 0x9d7d74, sky: 0x5a6a92, inscatter: 0xff8c4e, ambS: 0x6e7ea6, ambG: 0x342e2c, ambI: 0.48, exposure: 0.80 },
  { h: 21.0, sun: 0x4a4a74, sunI: 0.10, ground: 0x49495f, sky: 0x2b3450, inscatter: 0x5c5a80, ambS: 0x434f70, ambG: 0x22242c, ambI: 0.32, exposure: 0.68 },
  { h: 24.0, sun: 0x2a3550, sunI: 0.05, ground: 0x2a3244, sky: 0x1b2438, inscatter: 0x3d4a66, ambS: 0x2c3a58, ambG: 0x1a1d24, ambI: 0.28, exposure: 0.62 },
];

/** How far away the sun and moon discs are drawn, and how big. 70 / 3000 is about 1.3 degrees
 *  across — a little larger than the real sun, which reads better once bloom is on top. */
const DISC_DIST = 3000, DISC_SUN = 70, DISC_MOON = 52;

const _cA = new THREE.Color(), _cB = new THREE.Color();
/** Read the day table at a given hour, blending between the two keyframes on either side. */
export function sampleDay(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < DAY_TABLE.length - 2 && DAY_TABLE[i + 1].h <= h) i++;
  const a = DAY_TABLE[i], b = DAY_TABLE[i + 1];
  const t = (h - a.h) / (b.h - a.h || 1);
  const col = (ka) => _cA.setHex(a[ka]).lerp(_cB.setHex(b[ka]), t).clone();
  const num = (kn) => a[kn] + (b[kn] - a[kn]) * t;
  return {
    hour: h,
    sun: col('sun'), sunI: num('sunI'),
    ground: col('ground'), sky: col('sky'), inscatter: col('inscatter'),
    ambS: col('ambS'), ambG: col('ambG'), ambI: num('ambI'),
    exposure: num('exposure'),
  };
}

/**
 * Where the sun is at a given hour, as a unit vector. Noon puts it high in the south; the azimuth
 * swings from east to west through the day, tilted so it is not a plain overhead arc — a raking
 * sun throws far more interesting shadows than one directly above.
 */
export function sunDirection(hour, tilt = 0.62, out = new THREE.Vector3()) {
  const t = ((hour % 24) + 24) % 24;
  // -PI at midnight, 0 at 06:00, +PI at 18:00 — so elevation is sin() of this and is negative at night
  const a = ((t - 6) / 12) * Math.PI;
  const elev = Math.sin(a) * tilt * Math.PI * 0.5;
  const azim = -Math.PI * 0.5 + ((t - 6) / 12) * Math.PI * 0.86;
  const ce = Math.cos(elev);
  out.set(Math.sin(azim) * ce, Math.sin(elev), Math.cos(azim) * ce);
  return out.normalize();
}

/**
 * Build the sky rig.
 *
 * Returns an object with `setTime(hour)`, `setWeather(name)` and the lights, so the app can
 * scrub the day from a slider and everything follows.
 */
export function createSky(scene, renderer, camera, { quality, worldSize = 1024 } = {}) {
  const group = new THREE.Group();
  group.name = 'sky';
  scene.add(group);

  // --- the dome -------------------------------------------------------------------------------
  const sky = new Sky();
  sky.scale.setScalar(450000);
  sky.material.depthWrite = false;
  group.add(sky);
  const skyU = sky.material.uniforms;

  // --- the sun and moon discs ----------------------------------------------------------------
  // Drawn as small additive sprites far away. The bloom pass picks them up and gives them a halo,
  // and the god-ray pass streaks light off them through the trees.
  const discGeo = new THREE.PlaneGeometry(1, 1);
  // The discs sit at DISC_DIST, comfortably inside the camera's far plane, and they DO test
  // against the depth buffer. Both matter. Anything beyond the far plane is clipped away however
  // its material is set up; and with the depth test off, the sun draws straight through the tree
  // in front of it, which both looks wrong and robs the light shafts of the thing that breaks
  // them up. The sky dome behind is drawn without writing depth, so it never occludes them.
  const sunMat = new THREE.MeshBasicMaterial({
    color: 0xfff4e0, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, fog: false, map: discTexture(0xffffff, 1.0),
  });
  const sunDisc = new THREE.Mesh(discGeo, sunMat);
  sunDisc.scale.setScalar(DISC_SUN);
  sunDisc.renderOrder = -5;
  group.add(sunDisc);

  const moonMat = new THREE.MeshBasicMaterial({
    color: 0xcfd8ee, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, fog: false, map: discTexture(0xffffff, 0.55),
  });
  const moonDisc = new THREE.Mesh(discGeo, moonMat);
  moonDisc.scale.setScalar(DISC_MOON);
  moonDisc.renderOrder = -5;
  group.add(moonDisc);

  // --- stars ----------------------------------------------------------------------------------
  const starCount = quality?.stars ?? 1800;
  const starPos = new Float32Array(starCount * 3);
  const starSize = new Float32Array(starCount);
  let sseed = 12345;
  const srand = () => { sseed = (sseed * 1664525 + 1013904223) >>> 0; return sseed / 4294967296; };
  for (let i = 0; i < starCount; i++) {
    // Only the upper half of the sphere: nobody sees stars under the ground.
    const u = srand() * 2 - 1, th = srand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const y = Math.abs(u) * 0.92 + 0.06;
    starPos[i * 3] = Math.cos(th) * r * 40000;
    starPos[i * 3 + 1] = y * 40000;
    starPos[i * 3 + 2] = Math.sin(th) * r * 40000;
    starSize[i] = 160 + Math.pow(srand(), 3) * 620;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
  const starMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      attribute float aSize;
      varying float vTw;
      uniform float uTime;
      void main() {
        vec4 mv = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * ( 300.0 / -mv.z );
        // a slow twinkle keyed off the star's own position so no two blink together
        vTw = 0.72 + 0.28 * sin( uTime * 1.7 + position.x * 0.0007 + position.z * 0.0011 );
      }`,
    fragmentShader: /* glsl */`
      varying float vTw;
      uniform float uOpacity;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float a = smoothstep( 0.5, 0.06, length( d ) );
        gl_FragColor = vec4( vec3( 1.0, 0.98, 0.92 ), a * a * uOpacity * vTw );
      }`,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -6;
  group.add(stars);

  // --- clouds ---------------------------------------------------------------------------------
  // Two big scrolling sheets high overhead at slightly different speeds. Cheap, and parallax
  // between the two layers is enough to read as depth from the ground.
  const cloudTex = makeCloudTexture(1024, 3);
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
  const cloudLayers = [];
  for (let i = 0; i < 2; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: cloudTex, transparent: true, opacity: 0.3, depthWrite: false,
      fog: false, side: THREE.DoubleSide, color: 0xffffff,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldSize * 9, worldSize * 9, 1, 1), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 900 + i * 420;
    mesh.renderOrder = -4;
    mesh.material.map = cloudTex.clone();
    mesh.material.map.wrapS = mesh.material.map.wrapT = THREE.RepeatWrapping;
    mesh.material.map.repeat.set(5 - i * 1.6, 5 - i * 1.6);
    mesh.material.map.needsUpdate = true;
    group.add(mesh);
    cloudLayers.push(mesh);
  }

  // --- lights ---------------------------------------------------------------------------------
  const csm = new CSM({
    maxFar: quality?.shadowDistance ?? 260,
    cascades: quality?.cascades ?? 3,
    mode: 'practical',
    parent: scene,
    shadowMapSize: quality?.shadowMapSize ?? 2048,
    lightDirection: new THREE.Vector3(-0.5, -0.9, -0.4).normalize(),
    camera,
    lightIntensity: 1,
  });
  csm.fade = true;
  for (const light of csm.lights) {
    light.shadow.bias = -0.0006;
    light.shadow.normalBias = 0.035;
  }

  const hemi = new THREE.HemisphereLight(0xb2cbe8, 0x5a5648, 0.9);
  scene.add(hemi);
  // A dim fill from behind the sun keeps shadowed sides from going to pure black. Real skies do
  // this by bouncing light off everything; one cheap light is a good enough stand-in.
  const fill = new THREE.DirectionalLight(0x9fb8d8, 0.18);
  scene.add(fill);

  // --- reflections ----------------------------------------------------------------------------
  // Render the sky into a pre-filtered environment map so metal and wet surfaces reflect the real
  // sky of the moment. Regenerating this is not free, so it only happens when the sun has actually
  // moved a noticeable amount.
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  let envTarget = null;
  let lastEnvHour = -999;

  // A plain cube of the sky as well. The pre-filtered map above is what lights the world, but the
  // water shader wants a straight `textureCube` lookup, and a pre-filtered map is not one — it is
  // a 2D atlas with its own addressing. Rendering the dome into a small cube once per sky change
  // costs almost nothing (it is six faces of one mesh) and gives the lake a real sky to mirror.
  const skyCubeTarget = new THREE.WebGLCubeRenderTarget(256, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const skyCubeCamera = new THREE.CubeCamera(1, 100000, skyCubeTarget);

  const state = {
    hour: 9.5, weather: 'clear', sunDir: new THREE.Vector3(), day: sampleDay(9.5),
    exposure: 1, sunLight: csm.lights[0],
  };

  function regenerateEnv(force = false) {
    if (!force && Math.abs(state.hour - lastEnvHour) < 0.25) return;
    lastEnvHour = state.hour;
    const clone = sky.clone();
    clone.material = sky.material.clone();
    clone.material.uniforms.sunPosition.value.copy(skyU.sunPosition.value);
    clone.material.uniforms.turbidity.value = skyU.turbidity.value;
    clone.material.uniforms.rayleigh.value = skyU.rayleigh.value;
    clone.material.uniforms.mieCoefficient.value = skyU.mieCoefficient.value;
    clone.material.uniforms.mieDirectionalG.value = skyU.mieDirectionalG.value;
    envScene.clear();
    envScene.add(clone);
    const next = pmrem.fromScene(envScene, 0.04);
    if (envTarget) envTarget.dispose();
    envTarget = next;
    scene.environment = envTarget.texture;

    // and the plain cube for the water
    const prevTarget = renderer.getRenderTarget();
    skyCubeCamera.position.set(0, 60, 0);
    skyCubeCamera.update(renderer, envScene);
    renderer.setRenderTarget(prevTarget);
  }

  /** Move the whole world to a given hour of the day. */
  function setTime(hour) {
    state.hour = ((hour % 24) + 24) % 24;
    const w = WEATHER[state.weather] || WEATHER.clear;
    const d = sampleDay(state.hour);
    state.day = d;
    sunDirection(state.hour, 0.62, state.sunDir);

    // sky dome
    skyU.turbidity.value = w.turbidity;
    skyU.rayleigh.value = w.rayleigh;
    skyU.mieCoefficient.value = w.mie;
    skyU.mieDirectionalG.value = w.mieG;
    skyU.sunPosition.value.copy(state.sunDir);

    // sun / moon discs sit far away along their directions
    sunDisc.position.copy(state.sunDir).multiplyScalar(DISC_DIST).add(camera.position);
    sunDisc.lookAt(camera.position);
    sunMat.color.copy(d.sun).multiplyScalar(1.25);
    sunMat.opacity = THREE.MathUtils.clamp(state.sunDir.y * 6 + 0.1, 0, 1) * (1 - w.clouds * 0.6);

    const moonDir = state.sunDir.clone().multiplyScalar(-1);
    moonDisc.position.copy(moonDir).multiplyScalar(DISC_DIST).add(camera.position);
    moonDisc.lookAt(camera.position);
    moonMat.opacity = THREE.MathUtils.clamp(moonDir.y * 4, 0, 1) * 0.9 * (1 - w.clouds * 0.7);

    // stars fade in as the sun drops below the horizon
    starMat.uniforms.uOpacity.value = THREE.MathUtils.clamp(-state.sunDir.y * 7 - 0.1, 0, 1) * (1 - w.clouds * 0.8);

    // direct light
    const sunUp = Math.max(0, state.sunDir.y);   // also used by the ambient balance below
    const nightFloor = 0.045;
    const intensity = (d.sunI * w.sun) * (sunUp > 0.001 ? 1 : 0) + nightFloor;
    csm.lightDirection.copy(state.sunDir).multiplyScalar(-1).normalize();
    csm.lightIntensity = intensity;
    for (const l of csm.lights) { l.color.copy(d.sun); l.intensity = intensity; }
    // at night the "sun" light is really moonlight — cool and weak
    if (sunUp <= 0.001) {
      csm.lightDirection.copy(moonDir).multiplyScalar(-1).normalize();
      for (const l of csm.lights) { l.color.setHex(0x8fa4d8); l.intensity = 0.16 * (1 - w.clouds * 0.7) + 0.02; }
    }

    hemi.color.copy(d.ambS);
    hemi.groundColor.copy(d.ambG);

    // The ratio between the sun and everything else IS the shadow.
    //
    // Fill light and direct light were coming out about equal, so a shadow only removed half the
    // light falling on a surface and read as a slightly darker patch of grass rather than a
    // shadow. Worse, the fill was a flat amount all day, so at dusk — when the sun is weakest and
    // the shadows are longest — it was actually the brighter of the two. Both the sky probe and
    // the hemisphere light now fall away with the sun, which keeps direct light roughly three
    // times the fill through the day and lets the shadows read.
    const sunLift = THREE.MathUtils.clamp(sunUp * 2.4, 0, 1);
    hemi.intensity = d.ambI * w.ambient * (0.16 + 0.30 * sunLift);
    scene.environmentIntensity = w.ambient * (0.16 + 0.34 * sunLift);
    fill.position.copy(state.sunDir).multiplyScalar(-1).setY(0.4).normalize();
    fill.color.copy(d.ambS);
    fill.intensity = 0.14 * w.ambient;

    // fog — the numbers every material reads
    SHARED.hdFogGround.value.copy(d.ground);
    SHARED.hdFogSky.value.copy(d.sky);
    SHARED.hdFogSun.value.copy(d.inscatter);
    SHARED.hdSunDir.value.copy(state.sunDir);
    SHARED.hdFogDensity.value = w.fog;
    SHARED.hdFogHeight.value = w.fogHeight;
    SHARED.hdFogMax.value = state.weather === 'fogbank' ? 0.99 : 0.94;

    // clouds
    for (let i = 0; i < cloudLayers.length; i++) {
      const m = cloudLayers[i];
      m.material.opacity = w.clouds * (0.55 - i * 0.16);
      m.material.color.copy(d.sky).lerp(d.sun, 0.35 + sunUp * 0.2);
    }

    state.exposure = d.exposure;
    regenerateEnv();
    return state;
  }

  function setWeather(name) {
    if (!WEATHER[name]) return;
    state.weather = name;
    setTime(state.hour);
    regenerateEnv(true);
  }

  /** Per-frame: keep the dome centred on the camera and scroll the clouds. */
  function update(dt, elapsed) {
    group.position.set(camera.position.x, 0, camera.position.z);
    sunDisc.position.copy(state.sunDir).multiplyScalar(DISC_DIST)
      .add(new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z))
      .sub(group.position);
    sunDisc.lookAt(camera.position.clone().sub(group.position));
    const md = state.sunDir.clone().multiplyScalar(-DISC_DIST)
      .add(new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z))
      .sub(group.position);
    moonDisc.position.copy(md);
    moonDisc.lookAt(camera.position.clone().sub(group.position));

    starMat.uniforms.uTime.value = elapsed;
    const w = WEATHER[state.weather] || WEATHER.clear;
    for (let i = 0; i < cloudLayers.length; i++) {
      const map = cloudLayers[i].material.map;
      map.offset.x = (elapsed * w.cloudSpeed * (1 + i * 0.4)) % 1;
      map.offset.y = (elapsed * w.cloudSpeed * 0.35) % 1;
    }
    csm.update();
  }

  /** Where the sun is on screen, 0..1, plus whether it is in front of the camera at all. */
  const _v = new THREE.Vector3();
  function sunScreenPosition() {
    _v.copy(state.sunDir).multiplyScalar(5000).add(camera.position);
    _v.project(camera);
    const behind = state.sunDir.clone().dot(camera.getWorldDirection(new THREE.Vector3())) < 0;
    return { x: _v.x * 0.5 + 0.5, y: _v.y * 0.5 + 0.5, visible: !behind && state.sunDir.y > -0.05 };
  }

  setTime(state.hour);
  regenerateEnv(true);

  return {
    group, sky, csm, hemi, fill, stars, cloudLayers, sunDisc, moonDisc,
    state, setTime, setWeather, update, sunScreenPosition, regenerateEnv,
    skyCubeTarget,
    get envCube() { return skyCubeTarget.texture; },
    get hour() { return state.hour; },
    get weather() { return state.weather; },
    get sunDir() { return state.sunDir; },
    get exposure() { return state.exposure; },
    dispose() {
      pmrem.dispose(); if (envTarget) envTarget.dispose(); skyCubeTarget.dispose();
      starGeo.dispose(); starMat.dispose(); discGeo.dispose();
      csm.dispose();
    },
  };
}

/** A soft round disc drawn on a canvas — the sun and moon sprites. */
function discTexture(colour = 0xffffff, hardness = 1) {
  const s = 128;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  const hex = '#' + colour.toString(16).padStart(6, '0');
  grad.addColorStop(0, hex);
  grad.addColorStop(0.26 * hardness, hex);
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
