// Space model gallery: every builder in space-models.js in its own tile, turning.
//
// One WebGL renderer draws all the tiles (scissor + viewport per card), because a browser only hands
// out a handful of WebGL contexts and there are more models than that.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  createPlanet, createStar, createAsteroidBelt, createSatellite, createProbe, createRocket,
  createShip, createStation, createSpaceBackdrop,
} from './space-models.js';
import { ARCHETYPES } from '../../universe/js/system.js';
import { STAR_CLASSES, makeStar } from '../../universe/js/stars.js';
import { generateSystem } from '../../universe/js/system.js';
import { generatePlanetMap } from '../../universe/js/planetmap.js';
import { planetTexture } from '../../universe/js/texture.js';

const $ = id => document.getElementById(id);
const grid = $('model-grid');

// ---------------------------------------------------------------- demo records
// One example planet per archetype, found by rolling systems until each kind has turned up.

const demoPlanets = {};
for (let i = 0; i < 90 && Object.keys(demoPlanets).length < ARCHETYPES.length; i++) {
  const star = makeStar({ seed: 7000 + i, id: i });
  for (const p of generateSystem(star, { seed: star.seed, ringChance: 0.5, moonChance: 0.8 }).planets) {
    if (!demoPlanets[p.archetype]) demoPlanets[p.archetype] = p;
  }
}
// anything still missing gets a hand-built stand-in so the select is never short
for (const a of ARCHETYPES) {
  if (demoPlanets[a.key]) continue;
  demoPlanets[a.key] = {
    id: 0, seed: 1234, name: a.name, archetype: a.key, archetypeName: a.name, giant: a.giant,
    radius: 1, gravity: 1, axialTilt: 15, seed2: 1,
    atmosphere: { type: a.atmosphere.type, density: (a.atmosphere.density[0] + a.atmosphere.density[1]) / 2, color: a.atmosphere.color },
    temperature: { K: (a.tempK[0] + a.tempK[1]) / 2, C: 0, label: '' },
    poles: a.poles === true, biomeMode: a.biomeMode, biomeFamily: a.family, palette: a.palette,
    moons: [], rings: null, difficulty: a.difficulty, hazards: a.hazards, resources: [], rareElements: [],
  };
}

const MAP_SIZE = { width: 160, height: 80 };
const texCache = new Map();
function textureFor(planet) {
  if (texCache.has(planet.seed)) return texCache.get(planet.seed);
  const world = planet.giant ? null : generatePlanetMap(planet, MAP_SIZE);
  const tex = planetTexture(planet, world, { size: 512 });
  texCache.set(planet.seed, tex);
  return tex;
}

// ---------------------------------------------------------------- shared renderer

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setScissorTest(true);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const canvas = renderer.domElement;
canvas.id = 'gl';
Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '4' });
document.body.append(canvas);

const views = [];

/** One tile: a card in the grid plus its own scene, camera and controls. */
function addView(id, label, note, build, { distance = 3, y = 0.35, inside = false } = {}) {
  const card = document.createElement('div');
  card.className = 'model-card';
  card.dataset.id = id;
  card.innerHTML = `<div class="model-box"></div><div class="meta"><b>${label}</b><span class="tags">${note}</span></div>`;
  grid.append(card);
  const box = card.querySelector('.model-box');

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0x8899bb, 0.3));
  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(4, 2, 3);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.02, 900);
  camera.position.set(inside ? 0.01 : distance * 0.4, inside ? 0 : distance * y, inside ? 0.01 : distance);
  const controls = new OrbitControls(camera, box);
  controls.enableDamping = true;
  controls.enableZoom = !inside;
  controls.minDistance = 0.3; controls.maxDistance = 60;
  controls.target.set(0, 0, 0);
  controls.update();

  const view = { id, card, box, scene, camera, controls, key, model: null, build };
  rebuild(view);
  views.push(view);
  return view;
}

function rebuild(view) {
  if (view.model) { view.scene.remove(view.model.group); view.model.dispose(); }
  view.model = view.build();
  view.scene.add(view.model.group);
}

// ---------------------------------------------------------------- the tiles

const archSelect = $('archetype');
for (const a of ARCHETYPES) archSelect.append(new Option(a.name, a.key));
archSelect.value = 'living';

const starSelect = $('starclass');
for (const c of STAR_CLASSES) starSelect.append(new Option(c.name, c.key));
starSelect.value = 'yellow';

const planetView = addView('planet', 'createPlanet', 'map texture, atmosphere rim, clouds, rings, moons', () => {
  const planet = demoPlanets[archSelect.value];
  return createPlanet(planet, { texture: textureFor(planet), radius: 1 });
}, { distance: 3.4 });

const starView = addView('star', 'createStar', 'emissive core, corona, glow — binary, pulsar and black hole variants', () => {
  const star = makeStar({ seed: 4242, classKey: starSelect.value });
  return createStar(star, { radius: 0.8, lightIntensity: 2 });
}, { distance: 5 });

addView('asteroid_belt', 'createAsteroidBelt', 'instanced rocks in a flat annulus', () => createAsteroidBelt({ inner: 1.4, outer: 2.6, count: 700, seed: 9 }), { distance: 5.5, y: 0.5 });
addView('satellite', 'createSatellite', 'bus, solar wings, dish, antenna', () => createSatellite(), { distance: 2 });
addView('probe', 'createProbe', 'octahedral core, big dish, legs, thruster plume', () => createProbe(), { distance: 2.2 });
addView('rocket', 'createRocket', 'stages, fins, engine bell, flickering flame', () => createRocket(), { distance: 3 });
addView('ship_lander', "createShip('lander')", 'squat hull, glass cockpit, four legs', () => createShip('lander'), { distance: 2.2 });
addView('ship_hauler', "createShip('hauler')", 'spine, containers, twin engines', () => createShip('hauler'), { distance: 2.8 });
addView('ship_explorer', "createShip('explorer')", 'capsule fuselage, swept wings, canopy', () => createShip('explorer'), { distance: 2.4 });
addView('station', 'createStation', 'spinning habitat ring, hub, docking clamps, solar wings', () => createStation(), { distance: 3.2 });
addView('space_backdrop', 'createSpaceBackdrop', 'starfield points plus nebula sprites (the camera sits inside)', () => createSpaceBackdrop({ radius: 24, stars: 1400, nebula: 4, seed: 3 }), { inside: true });

archSelect.addEventListener('change', () => rebuild(planetView));
starSelect.addEventListener('change', () => rebuild(starView));

// ---------------------------------------------------------------- the loop

const clock = new THREE.Clock();
let frames = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  // wipe the whole canvas first, then draw only inside each tile — otherwise a tile that scrolls
  // out of view leaves its last frame behind
  renderer.setScissorTest(false);
  renderer.clear();
  renderer.setScissorTest(true);
  for (const v of views) {
    const r = v.box.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight || r.width < 4) continue;
    const bottom = window.innerHeight - r.bottom;
    renderer.setViewport(r.left, bottom, r.width, r.height);
    renderer.setScissor(r.left, bottom, r.width, r.height);
    v.camera.aspect = r.width / r.height;
    v.camera.updateProjectionMatrix();
    v.model?.update(dt, t);
    v.controls.update();
    renderer.render(v.scene, v.camera);
  }
  frames++;
  if (frames === 3) document.body.dataset.ready = '1';
}
loop();

$('status').textContent = `${views.length} models · ${ARCHETYPES.length} planet archetypes · ${STAR_CLASSES.length} star classes`;

window.modelsDemo = {
  views, renderer, demoPlanets,
  ids: () => views.map(v => v.id),
  setArchetype: k => { archSelect.value = k; rebuild(planetView); },
  setStarClass: k => { starSelect.value = k; rebuild(starView); },
  frames: () => frames,
};
