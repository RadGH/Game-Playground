// 3D High Def — the page.
//
// Boot order matters here and is not obvious, so it is worth writing down:
//
//   1. The world field is generated first and nothing else can start without it, because the
//      terrain mesh, the grass, the scatter and the character's feet all read the same heightmap.
//   2. The renderer comes next, because the sky needs it — the sky renders itself into a reflection
//      probe at build time, and that needs a live graphics context.
//   3. The sky comes before anything that casts a shadow, because it owns the cascaded shadow rig
//      and every material has to be handed that rig as it is created.
//   4. Everything else.
//
// Quality changes tear down from step 2 and rebuild. The world field survives, which is why
// switching preset takes a moment rather than the five seconds a full rebuild costs.

import * as THREE from 'three';
import { generateWorld, WORLD_DEFAULTS } from './world.js';
import { resolveQuality, detectPreset } from './quality.js';
import { createRenderer } from './renderer.js';
import { createSky, WEATHER } from './sky.js';
import { createTerrain } from './terrain.js';
import { createWater } from './water.js';
import { createGrass } from './grass.js';
import { createVegetation } from './vegetation.js';
import { scatterWorld } from './scatter.js';
import { createCharacter, PRESETS as CHARACTERS, STATES } from './character.js';
import { createController } from './controller.js';
import { createCameras } from './cameras.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { SHARED, tickMaterials } from './materials.js';

const stage = document.getElementById('stage');
const loader = document.getElementById('loading');
const loaderBar = document.getElementById('loading-bar');
const loaderText = document.getElementById('loading-text');

function progress(frac, label) {
  loaderBar.style.width = Math.round(frac * 100) + '%';
  loaderText.textContent = label;
  return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}

// A ?quality= / ?seed= / ?time= / ?weather= / ?view= in the address makes a particular look
// reproducible, which is what the tests and the screenshots need. Read before anything uses it —
// a `const` read from above its own line is a crash, not an undefined, and it is invisible to
// `node --check`.
const params = new URLSearchParams(location.search);

// --- persistent state, kept across quality rebuilds --------------------------------------------
let world = null;
let scatter = null;
let vegRules = null;
let seed = Number(params.get('seed')) || WORLD_DEFAULTS.seed;
let plantDensity = 1;

// --- live state --------------------------------------------------------------------------------
let quality = resolveQuality(params.get('quality') || detectPreset());
let overrides = {};
let scene, view, sky, terrain, water, grass, vegetation, character, controller, cameras, input, hud;
let running = false, disposed = false;
let clock = null;
let dayCycle = false, dayLength = 300;
let wantScreenshot = false;
let characterName = 'ranger';
let fpsSmooth = 60;

const app = {
  get quality() { return quality; },
  get seed() { return seed; },
  setCameraMode, setIsometric, setFov, setTime, setDayCycle, setDayLength, setWeather,
  setFog, setWind, setQuality, setPost, setGrassDensity, setViewDistance, setTreeDistance,
  setShadowDistance, setPixelRatio, setGrade, playClip, playState, setCharacter,
  rebuild, focusCharacter, respawn, setPlantDensity, screenshot,
};
window.highdef = app;   // so the Playwright tests can drive it
Object.defineProperty(app, '__renderer', { get: () => view.renderer });
Object.defineProperty(app, '__csm', { get: () => sky.csm });
Object.defineProperty(app, '__scene', { get: () => scene });

/** A look inside, for the tests and for tuning. Counts what is actually being drawn. */
app.debug = () => {
  const byLayer = {};
  let meshes = 0, instances = 0, tris = 0;
  vegetation.group.traverse(o => {
    if (!o.isMesh) return;
    meshes++;
    const layer = o.name.split('_')[0];
    const b = byLayer[layer] || (byLayer[layer] = { meshes: 0, instances: 0 });
    b.meshes++;
    b.instances += o.isInstancedMesh ? o.count : 1;
    instances += o.isInstancedMesh ? o.count : 1;
    const idx = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count;
    tris += (idx / 3) * (o.isInstancedMesh ? o.count : 1);
  });
  const lit = sky.csm.lights.map(l => ({
    on: l.castShadow, intensity: +l.intensity.toFixed(3),
    map: l.shadow.map ? `${l.shadow.map.width}x${l.shadow.map.height}` : 'none',
    cam: [l.shadow.camera.left, l.shadow.camera.right, l.shadow.camera.near, l.shadow.camera.far].map(n => Math.round(n)),
  }));
  const terrainShader = terrain.material.userData.shader;
  return {
    quality: quality.name,
    vegetation: { meshes, instances, tris: Math.round(tris), byLayer },
    terrainChunks: terrain.chunkCount,
    shadows: {
      enabled: view.renderer.shadowMap.enabled,
      cascades: sky.csm.cascades,
      casters: countCasters(),
      lights: lit,
      terrainHasCsm: !!terrainShader && /USE_CSM/.test(terrainShader.fragmentShader + (terrain.material.defines?.USE_CSM ?? '')),
      terrainDefines: Object.keys(terrain.material.defines || {}),
      sunDir: [sky.sunDir.x, sky.sunDir.y, sky.sunDir.z].map(n => +n.toFixed(3)),
    },
    render: { ...view.renderer.info.render },
    scatter: scatter.counts,
  };
};
function countCasters() {
  let n = 0;
  scene.traverse(o => { if (o.isMesh && o.castShadow && o.visible) n++; });
  return n;
}

boot().catch(err => {
  console.error(err);
  loaderText.textContent = 'Failed to start: ' + err.message;
  loaderText.classList.add('bad');
});

// =================================================================================================

async function boot() {
  loader.classList.remove('done');

  if (!world) {
    await progress(0.02, 'raising the land');
    const gen = generateWorld({ seed });
    let step = gen.next();
    let lastPaint = performance.now();
    while (!step.done && !step.value.world) {
      if (performance.now() - lastPaint > 60) {
        await progress(step.value.progress * 0.35, step.value.label);
        lastPaint = performance.now();
      }
      step = gen.next();
    }
    world = step.value.world;
  }

  if (!vegRules) {
    await progress(0.36, 'reading the planting rules');
    vegRules = await fetch(new URL('../data/vegetation.json', import.meta.url)).then(r => r.json());
  }

  if (!scatter) {
    await progress(0.40, 'sowing the forest');
    scatter = scatterWorld(world, vegRules, { seed: seed + 17, density: plantDensity });
  }

  // --- scene ------------------------------------------------------------------------------------
  await progress(0.46, 'starting the renderer');
  scene = new THREE.Scene();
  scene.background = null;

  view = createRenderer(stage, quality);
  cameras = createCameras(world, { aspect: stage.clientWidth / Math.max(1, stage.clientHeight) });

  await progress(0.52, 'lighting the sky');
  sky = createSky(scene, view.renderer, cameras.camera, { quality, worldSize: world.size });

  await progress(0.58, 'laying the ground');
  terrain = createTerrain(world, quality, { csm: sky.csm });
  scene.add(terrain.group);

  await progress(0.66, 'filling the lakes');
  water = createWater(world, quality);
  water.setEnvironment(sky.envCube);
  scene.add(water.mesh);

  await progress(0.72, 'growing the trees');
  vegetation = await createVegetation({ world, scatter, quality, csm: sky.csm, seed });
  scene.add(vegetation.group);

  await progress(0.84, 'seeding the grass');
  grass = createGrass(world, quality, { csm: sky.csm, seed: seed + 5 });
  if (grass.mesh) scene.add(grass.mesh);

  await progress(0.90, 'waking the traveller');
  character = await createCharacter(characterName, { csm: sky.csm, shadows: true });
  scene.add(character.group);
  controller = createController(world, character, { vegetation });

  const spawn = world.findSpawn(seed);
  controller.spawn(spawn.x, spawn.z);
  cameras.focusOn(spawn.x, spawn.z);

  await progress(0.94, 'building the view');
  terrain.preload(controller.position, 220);
  vegetation.preload(controller.position, 190);

  input = input || createInput(view.renderer.domElement);
  if (!hud) {
    hud = createHud(document.body, app);
    hud.setClips(character.clipNames);
    wireHud();
  }

  view.build(scene, cameras.active(), quality);
  if (params.get('weather')) sky.setWeather(params.get('weather'));
  sky.setTime(params.get('time') != null ? Number(params.get('time')) : sky.state.hour);
  applyWaterMood();
  if (params.get('view') === 'follow') setCameraMode('follow');

  // Put the panel where the world actually is. Starting from a ?time= or ?weather= in the address
  // otherwise leaves the clock reading 09:30 while the sun sits at half past three.
  hud.widgets.timeKnob.set(sky.state.hour);
  hud.widgets.quality.set(quality.name);
  hud.setViewButton(cameras.mode);

  await progress(1, 'ready');
  loader.classList.add('done');
  clock = { last: performance.now() / 1000, elapsed: 0 };
  running = true;
  if (!disposed) requestAnimationFrame(frame);
}

// =================================================================================================
// the loop

function frame() {
  if (!running) return;
  requestAnimationFrame(frame);
  const now = performance.now() / 1000;
  const dt = Math.min(0.1, now - clock.last);
  clock.last = now;
  clock.elapsed += dt;
  const elapsed = clock.elapsed;

  // --- input that is not movement --------------------------------------------------------------
  if (input.pressed('toggleView')) setCameraMode(cameras.mode === 'follow' ? 'overhead' : 'follow');
  if (input.pressed('hud')) hud.toggle();
  if (input.pressed('help')) hud.help.classList.toggle('open');
  if (input.pressed('screenshot')) screenshot();
  if (input.pressed('wave')) character.playOnce('wave');
  if (input.pressed('dance')) character.setState('dance');
  if (input.pressed('swing')) character.playOnce('swordSwing');
  if (input.pressed('roll')) character.playOnce('roll');

  // left-click on the ground in the strategy view sends the character there
  if (cameras.mode === 'overhead' && input.state.buttons.has(0) && !dragMoved) {
    const spot = pointerGround();
    if (spot) { controller.orderMoveTo(spot.x, spot.z); markClick(spot); }
  }
  trackDrag();

  // --- the world -------------------------------------------------------------------------------
  if (dayCycle) {
    sky.setTime(sky.state.hour + (24 / dayLength) * dt);
    hud.widgets.timeKnob.set(sky.state.hour);
  }

  tickMaterials(elapsed);
  controller.update(dt, input, cameras.state.followYaw, cameras.mode);
  cameras.update(dt, input, controller.subject);
  character.update(dt);

  const cam = cameras.active();
  const focus = cameras.mode === 'follow' ? controller.position : cameras.state.focus;
  terrain.update(cam.position, 3);
  vegetation.update(cam.position, 2);
  if (grass.mesh) grass.update(cameras.mode === 'follow' ? controller.position : groundUnderCamera(cam), controller.position);
  sky.update(dt, elapsed);
  water.setSun(sky.sunDir, sky.state.day.sun);
  water.uniforms.uTime.value = elapsed;

  // the shafts need to know where the sun is on the screen
  if (view.passes.godRays) {
    const s = sky.sunScreenPosition();
    view.passes.godRays.uniforms.uSunPos.value.set(s.x, s.y);
    const want = s.visible ? THREE.MathUtils.clamp(sky.sunDir.y * 3.2, 0, 1) : 0;
    const u = view.passes.godRays.uniforms.uAmount;
    u.value += (want * (gradeState.rays ?? 1) - u.value) * Math.min(1, dt * 4);
    view.passes.godRays.uniforms.uTint.value.copy(sky.state.day.inscatter);
  }
  view.renderer.toneMappingExposure = sky.exposure * (gradeState.exposure ?? 1);

  // --- draw ------------------------------------------------------------------------------------
  if (view.passes.render) view.passes.render.camera = cam;
  if (view.passes.gtao) view.passes.gtao.camera = cam;
  view.render(dt);

  if (wantScreenshot) {
    wantScreenshot = false;
    saveCanvas();
  }

  // --- readouts ---------------------------------------------------------------------------------
  const fps = 1 / Math.max(1e-4, dt);
  fpsSmooth += (fps - fpsSmooth) * 0.08;
  const info = view.renderer.info;
  hud.tick({
    fps: fpsSmooth,
    triangles: info.render.triangles,
    calls: info.render.calls,
    textures: info.memory.textures,
    crumb: crumbText(focus),
  });

  input.endFrame();
}

function crumbText(focus) {
  const p = controller.position;
  const h = sky.state.hour;
  const tod = String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.round((h % 1) * 60)).padStart(2, '0');
  const w = WEATHER[sky.weather]?.label || '';
  const st = controller.state;
  const doing = st.swimming ? 'swimming' : !st.grounded ? 'in the air' : st.crouching ? 'crouching'
    : st.speed > 5 ? 'sprinting' : st.speed > 2.4 ? 'jogging' : st.speed > 0.15 ? 'walking' : 'standing';
  void focus;
  return `${world.biomeNameAt(p.x, p.z)} · ${p.x.toFixed(0)}, ${p.z.toFixed(0)} · ${p.y.toFixed(1)} m · ${tod} ${w} · ${doing} · ` +
    `${vegetation.stats.instances.toLocaleString()} plants drawn` + (grass.mesh ? ` · ${(grass.visibleCount / 1000).toFixed(0)}k blades` : '');
}

const _gc = new THREE.Vector3();
function groundUnderCamera(cam) {
  // For the strategy view the grass should sit under the point the camera is LOOKING at, not the
  // point it is at — otherwise a steeply tilted camera leaves a bald patch at the bottom of the
  // screen and grows grass off in the distance behind it.
  return _gc.set(cameras.state.focus.x, 0, cameras.state.focus.z);
}

// --- pointer bookkeeping -------------------------------------------------------------------------
let dragStart = null, dragMoved = false;
function trackDrag() {
  if (input.state.buttons.has(0)) {
    if (!dragStart) { dragStart = { x: input.state.pointer.x, y: input.state.pointer.y }; dragMoved = false; }
    else if (Math.abs(input.state.pointer.x - dragStart.x) > 0.006 || Math.abs(input.state.pointer.y - dragStart.y) > 0.006) dragMoved = true;
  } else {
    dragStart = null;
    // let the next frame's click through
    setTimeout(() => { dragMoved = false; }, 0);
  }
}

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
function pointerGround() {
  if (!input.state.pointer.inside) return null;
  _ndc.set(input.state.pointer.x * 2 - 1, -(input.state.pointer.y * 2 - 1));
  _ray.setFromCamera(_ndc, cameras.active());
  return world.raycast(_ray.ray.origin, _ray.ray.direction, 4000);
}

let marker = null;
function markClick(spot) {
  if (!marker) {
    const g = new THREE.RingGeometry(0.45, 0.62, 28);
    g.rotateX(-Math.PI / 2);
    marker = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0.9, depthTest: false, fog: false }));
    marker.renderOrder = 8;
    scene.add(marker);
  }
  marker.position.set(spot.x, spot.y + 0.08, spot.z);
  marker.visible = true;
  marker.userData.at = performance.now();
  clearTimeout(marker.userData.timer);
  marker.userData.timer = setTimeout(() => { if (marker) marker.visible = false; }, 1400);
}

// =================================================================================================
// the things the panel calls

function setCameraMode(mode) {
  cameras.setMode(mode, controller.subject);
  hud.setViewButton(mode);
  if (mode === 'follow') controller.stop();
}
function setIsometric(on) {
  cameras.setIsometric(on);
  view.build(scene, cameras.active(), quality);
}
function setFov(v) { cameras.state.fovBase = v; }
function setTime(v) { sky.setTime(v); applyWaterMood(); }
function setDayCycle(v) { dayCycle = !!v; }
function setDayLength(v) { dayLength = v; }
function setWeather(name) { sky.setWeather(name); applyWaterMood(); }

function applyWaterMood() {
  const w = WEATHER[sky.weather] || WEATHER.clear;
  const stormy = w.clouds > 0.7;
  water.setMood({
    shallow: stormy ? 0x3f5a58 : 0x4f7d72,
    deep: stormy ? 0x0a161c : 0x0b2029,
    chop: stormy ? 0.95 : 0.55,
    env: 0.7 + (1 - w.clouds) * 0.6,
  });
  water.setEnvironment(sky.envCube);
}

function setFog({ density, height, sunPower }) {
  if (density != null) SHARED.hdFogDensity.value = density;
  if (height != null) SHARED.hdFogHeight.value = height;
  if (sunPower != null) SHARED.hdFogSunPower.value = sunPower;
}
function setWind({ strength, speed, direction }) {
  if (strength != null) SHARED.uWindStrength.value = strength;
  if (speed != null) SHARED.uWindSpeed.value = speed;
  if (direction != null) {
    const a = direction * Math.PI / 180;
    SHARED.uWindDir.value.set(Math.sin(a), 0, Math.cos(a));
  }
}

const gradeState = { exposure: 1, rays: 1 };
function setGrade(o) {
  const g = view.passes.grade;
  if (o.exposure != null) gradeState.exposure = o.exposure;
  if (o.rays != null) gradeState.rays = o.rays;
  if (!g) return;
  if (o.contrast != null) g.uniforms.uContrast.value = o.contrast;
  if (o.saturation != null) g.uniforms.uSaturation.value = o.saturation;
  if (o.vignette != null) g.uniforms.uVignette.value = o.vignette;
  if (o.split != null) g.uniforms.uSplit.value = o.split;
  if (o.grain != null) g.uniforms.uGrain.value = o.grain;
  if (o.bloom != null && view.passes.bloom) view.passes.bloom.strength = o.bloom;
}

function setPost(o) {
  overrides = { ...overrides, ...o };
  quality = resolveQuality(quality.name, overrides);
  view.build(scene, cameras.active(), quality);
}
function setGrassDensity(v) { if (grass.setDensity) grass.setDensity(v); }
function setViewDistance(v) { quality.terrainViewDistance = v; overrides.terrainViewDistance = v; }
function setTreeDistance(v) { quality.treeDistance = v; overrides.treeDistance = v; }
function setShadowDistance(v) {
  quality.shadowDistance = v; overrides.shadowDistance = v;
  sky.csm.maxFar = v;
  sky.csm.updateFrustums();
}
function setPixelRatio(v) {
  quality.pixelRatio = v; overrides.pixelRatio = v;
  view.renderer.setPixelRatio(Math.min(v, window.devicePixelRatio || 1));
  view.build(scene, cameras.active(), quality);
  onResize();
}

async function setQuality(name) {
  overrides = {};
  quality = resolveQuality(name);
  await rebuildScene();
  hud.syncQuality(quality);
}

async function rebuildScene() {
  running = false;
  teardownScene();
  await boot();
}

function teardownScene() {
  if (grass?.mesh) scene.remove(grass.mesh);
  grass?.dispose?.();
  if (vegetation) { scene.remove(vegetation.group); vegetation.dispose(); }
  if (water) { scene.remove(water.mesh); water.dispose(); }
  if (terrain) { scene.remove(terrain.group); terrain.dispose(); }
  if (character) { scene.remove(character.group); character.dispose(); }
  if (marker) { scene.remove(marker); marker = null; }
  if (sky) { sky.dispose(); }
  if (view) view.dispose();
  scene = null;
}

async function rebuild(newSeed) {
  seed = Number(newSeed) || seed;
  world = null; scatter = null;
  await rebuildScene();
}

async function setPlantDensity(v) {
  plantDensity = v;
  scatter = null;
  await rebuildScene();
}

async function setCharacter(name) {
  characterName = CHARACTERS[name] ? name : 'ranger';
  const at = controller.position.clone();
  const facing = controller.state.facing;
  scene.remove(character.group);
  character.dispose();
  character = await createCharacter(characterName, { csm: sky.csm, shadows: true });
  scene.add(character.group);
  controller = createController(world, character, { vegetation });
  controller.spawn(at.x, at.z);
  controller.state.facing = facing;
  hud.setClips(character.clipNames);
}

/**
 * Play any clip from the library by name. Most map onto a named state; the rest (there are 43
 * clips and 22 states) are played straight, which is the point of offering the whole list.
 */
function playClip(name) {
  const state = Object.keys(STATES).find(k => STATES[k].clip === name);
  controller.state.frozen = true;
  if (state) { character.setState(state); return; }
  for (const mixer of character.mixers) {
    const clip = character.clips.get(name);
    if (!clip) continue;
    mixer.stopAllAction();
    const a = mixer.clipAction(clip);
    a.reset(); a.setEffectiveWeight(1); a.play();
  }
}
function playState(name) {
  if (!name) { controller.state.frozen = false; character.setLocomotion(0); return; }
  controller.state.frozen = ['dance', 'sit', 'swordIdle', 'talk'].includes(name);
  if (['wave', 'swordSwing', 'roll', 'punch', 'pickUp'].includes(name)) character.playOnce(name);
  else character.setState(name);
}

function focusCharacter() { cameras.focusOn(controller.position.x, controller.position.z); }
function respawn() {
  const s = world.findSpawn(Math.floor(Math.random() * 1e9));
  controller.spawn(s.x, s.z);
  cameras.focusOn(s.x, s.z);
}

function screenshot() { wantScreenshot = true; }
function saveCanvas() {
  try {
    const url = view.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `highdef-${Date.now()}.png`;
    a.click();
  } catch (e) {
    console.warn('screenshot failed', e);
  }
}

// --- glue ----------------------------------------------------------------------------------------
function wireHud() {
  window.addEventListener('resize', onResize);
  onResize();
}

function onResize() {
  const w = stage.clientWidth || window.innerWidth;
  const h = stage.clientHeight || window.innerHeight;
  view.setSize(w, h);
  cameras.setAspect(w / Math.max(1, h));
}
