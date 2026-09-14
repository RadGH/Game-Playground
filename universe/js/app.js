// Star Forge viewer: knobs on the left, four views in the middle, details on the right.
//
//   galaxy  → a 2D map of the whole galaxy: stars by class, travel lanes, hover, click a star
//   system  → a 3D view of that star and its planets on their orbits; click a planet
//   planet  → that planet up close: real surface texture, atmosphere, clouds, rings, moons
//   map     → the same planet as a World Forge map, with the usual world → region → local zooms
//
// window.universeDemo exposes the lot for the tests and for poking at from the console.

import { el, knob, select, button, textInput, panel, toast } from '../../shared/ui.js';
import { generateGalaxy, GALAXY_DEFAULTS, GALAXY_PRESETS, LAYOUTS, nearestStar } from './galaxy.js';
import { generateSystem, SYSTEM_DEFAULTS, ARCH_BY_KEY, planetSummary, orbitLayout, moonById } from './system.js';
import { STAR_CLASSES, starSummary, mixColor } from './stars.js';
import { generatePlanetMap, hasSurfaceMap, clearMapCache, familyShare, mapMix, mapSizeFor } from './planetmap.js';
import { planetTexture } from './texture.js';
import { toJSON, download, jsonSizeKB } from './export.js';
import { BASELINE, RARE } from './elements.js';
import {
  createSpaceScene, createPlanet, createStar, createAsteroidBelt, createSpaceBackdrop,
} from '../../assets/js/space-models.js';
import { renderWorld, renderRegion, renderLocal, cellAt, legend as legendRows, DEFAULT_LAYERS } from '../../worldgen/js/render.js';
import { generateRegionDetail, generateLocalDetail } from '../../worldgen/js/local.js';
import { cellInfo } from '../../worldgen/js/world.js';
import { NameGen } from '../../namegen/js/namegen.js';

const $ = id => document.getElementById(id);
const RACES = ['auto', 'human', 'elf', 'dwarf', 'halfling', 'gnome', 'giant', 'troll', 'orc', 'goblin', 'dragon', 'undead', 'fey'];
const MAP_SIZES = { small: { width: 128, height: 64 }, medium: { width: 192, height: 96 }, large: { width: 288, height: 144 } };

const state = {
  opts: {
    ...GALAXY_DEFAULTS, ...SYSTEM_DEFAULTS,
    seed: 20260913, stars: 240, mix: { ...GALAXY_DEFAULTS.mix },
    mapSize: 'medium', nameRace: null, namegen: null,
  },
  galaxy: null, star: null, system: null, planet: null, moon: null,
  orbit: null,                       // the drawn orbit ladder for the system on screen
  world: null, detail: null, tile: null,
  view: 'galaxy', mapLevel: 'world', mapLayer: 'biomes',
  layers: { ...DEFAULT_LAYERS },
  hoverStar: null, busy: false, ready: false,
  starFilter: '', textures: new Map(),
};
delete state.opts.namegen;

let namegen = null;
let view3d = null, backdrop = null, sceneObjects = [];
let parentDrawn = null;            // what the moon view drew behind the moon, for the tests

// ---------------------------------------------------------------------------- 3D plumbing

function ensure3d() {
  if (view3d) return view3d;
  view3d = createSpaceScene($('three'), { background: 0x05070d, ambient: 0.2, distance: 6 });
  backdrop = createSpaceBackdrop({ radius: 400, stars: 1800, nebula: 3, seed: state.opts.seed });
  view3d.scene.add(backdrop.group);
  view3d.addTicker(backdrop.update);
  view3d.renderer.domElement.addEventListener('pointerdown', on3dDown);
  view3d.renderer.domElement.addEventListener('pointerup', on3dUp);
  return view3d;
}

function clear3d() {
  if (!view3d) return;
  for (const o of sceneObjects) {
    view3d.scene.remove(o.model.group);
    view3d.removeTicker(o.model.update);
    o.model.dispose();
  }
  sceneObjects = [];
}

let downAt = null;
function on3dDown(e) { downAt = { x: e.clientX, y: e.clientY }; }
function on3dUp(e) {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 5) return;                                 // a drag is a camera move, not a click
  if (state.view === 'system') {
    const hit = pick3d(e, 'planetId', sceneObjects.filter(o => o.planetId != null));
    if (hit != null) openPlanet(hit);
  } else if (state.view === 'planet') {
    // in the planet view the little spheres going round it are its moons — click one to land there
    const i = pick3d(e, 'moonIndex', sceneObjects.filter(o => o.body));
    const moon = i != null ? (state.planet?.moons || [])[i] : null;
    if (moon) openMoon(moon.id);
  }
}

function pick3d(e, key, objects) {
  const THREE = view3d.THREE;
  const rect = view3d.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, view3d.camera);
  const hits = ray.intersectObjects(objects.map(o => o.model.group), true);
  if (!hits.length) return null;
  let node = hits[0].object;
  while (node && node.userData[key] == null) node = node.parent;
  return node?.userData[key] ?? null;
}

// ---------------------------------------------------------------------------- generation

function setBusy(on, label = 'working…') {
  state.busy = on;
  $('stage').classList.toggle('busy', on);
  $('progress').hidden = !on;
  $('progressLabel').textContent = label;
  $('progressBar').style.width = on ? '60%' : '0%';
}

function generate() {
  setBusy(true, 'laying out the galaxy');
  const o = state.opts;
  state.galaxy = generateGalaxy({
    seed: o.seed, stars: o.stars, layout: o.layout, arms: o.arms, twist: o.twist, spread: o.spread,
    coreDensity: o.coreDensity, clusters: o.clusters, lanes: o.lanes, laneRange: o.laneRange,
    mix: o.mix, namegen, nameRace: o.nameRace,
  });
  state.star = null; state.system = null; state.planet = null; state.moon = null;
  state.orbit = null;
  state.world = null; state.detail = null; state.tile = null;
  state.textures.clear();
  clearMapCache();
  showView('galaxy');
  renderRight();
  setBusy(false);
  state.ready = true;
  $('status').textContent = `${state.galaxy.stats.stars} stars · ${state.galaxy.stats.lanes} lanes · ${state.galaxy.stats.exotic} exotic`;
  return state.galaxy;
}

function systemOf(star) {
  const o = state.opts;
  return generateSystem(star, {
    seed: star.seed, planets: o.planets, moonChance: o.moonChance, ringChance: o.ringChance,
    beltChance: o.beltChance, cometChance: o.cometChance, rareWorlds: o.rareWorlds,
    hazardLevel: o.hazardLevel, rareDensity: o.rareDensity, namegen, nameRace: o.nameRace,
  });
}

function openStar(id) {
  const star = state.galaxy.stars[id];
  if (!star) return null;
  setBusy(true, 'scanning the system');
  state.star = star;
  state.system = systemOf(star);
  state.planet = null; state.moon = null; state.world = null; state.detail = null; state.tile = null;
  buildSystemScene();
  showView('system');
  renderRight();
  setBusy(false);
  return state.system;
}

function openPlanet(id) {
  if (!state.system) return null;
  const planet = state.system.planets[id];
  if (!planet) return null;
  setBusy(true, 'mapping the surface');
  state.planet = planet; state.moon = null;
  state.world = null; state.detail = null; state.tile = null;
  buildPlanetScene(planet);
  showView('planet');
  renderRight();
  setBusy(false);
  return planet;
}

/**
 * Land on a moon. A moon is a small planet — same scene, same surface map, half the grid — so this
 * is the planet path with the parent kept in `state.planet` so the breadcrumb still works.
 * `id` is the moon's stable id, "<planetId>m<index>".
 */
function openMoon(id) {
  if (!state.system) return null;
  const moon = moonById(state.system, id);
  if (!moon) return null;
  setBusy(true, 'mapping the moon');
  state.planet = state.system.planets[moon.parentId] || state.planet;
  state.moon = moon;
  state.world = null; state.detail = null; state.tile = null;
  buildPlanetScene(moon, state.planet);
  showView('moon');
  renderRight();
  setBusy(false);
  return moon;
}

/** Whatever is being looked at up close — a moon if one is open, otherwise the planet. */
function currentBody() { return state.moon || state.planet; }

/** The body's map + texture set, generated once and kept. A moon gets the smaller grid. */
function texturesFor(body) {
  if (state.textures.has(body.seed)) return state.textures.get(body.seed);
  const size = mapSizeFor(body, MAP_SIZES[state.opts.mapSize]);
  const world = hasSurfaceMap(body) ? generatePlanetMap(body, { ...size, namegen }) : null;
  const texture = planetTexture(body, world, { size: body.moon ? 512 : 1024 });
  const set = { world, texture };
  state.textures.set(body.seed, set);
  return set;
}

// ---------------------------------------------------------------------------- the system scene

function buildSystemScene() {
  ensure3d();
  clear3d();
  const sys = state.system, star = state.star;
  const THREE = view3d.THREE;

  const starRadius = Math.max(0.45, Math.min(1.6, Math.cbrt(Math.max(0.02, star.radius)) * 0.55));
  const starModel = createStar(star, { radius: starRadius, lightIntensity: 26 });
  view3d.scene.add(starModel.group);
  view3d.addTicker(starModel.update);
  sceneObjects.push({ model: starModel });
  view3d.ambient.intensity = star.classKey === 'blackHole' ? 0.34 : 0.22;

  // the orbit ladder: a log scale first, then a pass that pushes any two rings that came out too
  // close apart, so no two orbits are ever drawn nearly touching (system.js owns the maths)
  const layout = orbitLayout(sys, { starRadius, minGap: 1.05 });
  state.orbit = layout;
  const ringFor = au => layout.radiusFor(au);

  for (const p of sys.planets) {
    const r = layout.radii[p.index] ?? ringFor(p.orbit.au);
    const orbit = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(new THREE.Path().absarc(0, 0, r, 0, Math.PI * 2).getSpacedPoints(128).map(v => new THREE.Vector3(v.x, 0, v.y))),
      new THREE.LineBasicMaterial({ color: p.orbit.inZone ? 0x4a8a5a : 0x2c3444, transparent: true, opacity: 0.7 }),
    );
    view3d.scene.add(orbit);
    sceneObjects.push({ model: { group: orbit, update: () => {}, dispose: () => { orbit.geometry.dispose(); orbit.material.dispose(); } } });

    // never wider than its own lane: a third of the narrower gap either side of it
    const want = Math.max(0.12, Math.min(0.55, (p.giant ? 0.3 : 0.17) * Math.pow(p.radius, 0.4)));
    const size = Math.max(0.08, layout.sizeFor(p.index, want));
    const model = createPlanet(p, { radius: size, detail: 32, textureSize: 256, moons: false });
    const angle = (p.id * 2.399) % (Math.PI * 2);            // golden angle, so they never line up
    model.group.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
    model.group.traverse(o => { o.userData.planetId = p.id; });
    model.group.userData.planetId = p.id;
    view3d.scene.add(model.group);
    view3d.addTicker(model.update);
    sceneObjects.push({ model, planetId: p.id });
  }

  for (const b of sys.belts) {
    const bi = ringFor(b.inner), bo = ringFor(b.outer);
    // keep the rocks small against the orbit rings around them
    const belt = createAsteroidBelt({ inner: bi, outer: bo, count: Math.round(220 + b.density * 700), seed: b.seed, tilt: 0.02, rockScale: Math.min(0.35, Math.max(0.06, 0.5 * (bo - bi) / Math.max(0.6, bo))) });
    view3d.scene.add(belt.group);
    view3d.addTicker(belt.update);
    sceneObjects.push({ model: belt });
  }

  view3d.setStarLight(star.classKey === 'blackHole' ? '#ffb46a' : mixColor(star.color, '#ffffff', 0.55), 0.5, [0, 0.6, 0]);
  // pull the camera back far enough for the outermost ring, which now sits wherever the gap pass put it
  const far = Math.max(6, layout.max + 1.2);
  view3d.camera.position.set(0, far * 0.6, far * 1.3);
  view3d.controls.target.set(0, 0, 0);
  view3d.controls.update();
}

// ---------------------------------------------------------------------------- the planet scene

function buildPlanetScene(body, parent = null) {
  ensure3d();
  clear3d();
  parentDrawn = null;
  const { texture } = texturesFor(body);
  const sunAt = [26, 6, 14];
  const model = createPlanet(body, { texture, radius: 1, detail: 96, sunDirection: sunAt });
  view3d.scene.add(model.group);
  view3d.addTicker(model.update);
  sceneObjects.push({ model, planetId: body.id, body });

  // a moon gets the world it circles hanging behind it, which is most of what standing on one looks
  // like. It uses the parent's real surface texture — the same cached set the planet view draws with
  // — not the generic procedural one, or the planet turns brown the moment you land on its moon.
  if (parent) {
    const parentTex = texturesFor(parent).texture;
    const big = createPlanet(parent, { texture: parentTex, radius: 2.6, detail: 64, moons: false, sunDirection: sunAt });
    parentDrawn = { id: parent.id, name: parent.name, textured: big.material.map?.image === parentTex.map };
    big.group.position.set(-6.4, 1.1, -7.5);
    view3d.scene.add(big.group);
    view3d.addTicker(big.update);
    sceneObjects.push({ model: big });
  }

  // the star, far off to one side, so the planet has a day side and a night side
  const star = state.star;
  const far = createStar(star, { radius: 1.4, lightIntensity: 0 });
  far.group.position.set(...sunAt);
  view3d.scene.add(far.group);
  view3d.addTicker(far.update);
  sceneObjects.push({ model: far });

  view3d.ambient.intensity = 0.2;
  // a star's own colour is far too saturated to light a whole planet with — pull it toward white
  view3d.setStarLight(star.classKey === 'blackHole' ? '#ffb46a' : mixColor(star.color, '#ffffff', 0.6), 3.3, sunAt);
  const maxMoon = Math.max(1, ...(body.moons || []).map(m => m.distance || 1));
  view3d.camera.position.set(0, 0.9, Math.min(9, 3.1 + maxMoon * 0.35));
  view3d.controls.target.set(0, 0, 0);
  view3d.controls.update();
}

// ---------------------------------------------------------------------------- views

function showView(name) {
  state.view = name;
  $('galaxy').hidden = name !== 'galaxy';
  $('three').hidden = !(name === 'system' || name === 'planet' || name === 'moon');
  $('map').hidden = name !== 'map';
  if (name === 'galaxy') drawGalaxy();
  if (name === 'map') drawMap();
  if (!$('three').hidden && view3d) view3d.resize();
  renderCrumbs();
  renderLegend();
  $('readout').innerHTML = '';
  if (name === 'galaxy') $('readout').append(el('span', { class: 'muted small', text: 'Hover a star for its class, click it to fly in.' }));
  if (name === 'system') $('readout').append(el('span', { class: 'muted small', text: 'Drag to orbit, scroll to zoom, click a planet to land on it.' }));
  if (name === 'planet') $('readout').append(el('span', { class: 'muted small', text: 'Drag to spin the planet, click one of its moons to land there. Open the Map view for its surface.' }));
  if (name === 'moon') $('readout').append(el('span', { class: 'muted small', text: 'A moon of ' + (state.planet?.name || 'the planet') + '. Open the Map view for its surface.' }));
}

function showMap() {
  const body = currentBody();
  if (!body) return null;
  if (!hasSurfaceMap(body)) { toast('A gas giant has no surface to map.'); return null; }
  setBusy(true, 'generating the surface');
  const { world } = texturesFor(body);
  state.world = world;
  state.mapLevel = 'world'; state.detail = null; state.tile = null;
  showView('map');
  setBusy(false);
  renderRight();
  return world;
}

// ---------------------------------------------------------------------------- galaxy canvas

function galaxyView() {
  const c = $('galaxy');
  const size = Math.min(c.width, c.height);
  return { cx: c.width / 2, cy: c.height / 2, scale: size * 0.47 };
}
const toScreen = (v, s) => ({ x: v.cx + s.x * v.scale, y: v.cy + s.y * v.scale });

function drawGalaxy() {
  const c = $('galaxy');
  const box = $('stage').getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.max(320, Math.round(box.width * dpr));
  c.height = Math.max(160, Math.round(box.height * dpr));
  const ctx = c.getContext('2d');
  const g = state.galaxy;
  if (!g) return;

  ctx.fillStyle = '#05070d';
  ctx.fillRect(0, 0, c.width, c.height);

  const v = galaxyView();
  // a faint core glow so the middle of the galaxy is not just empty black
  const glow = ctx.createRadialGradient(v.cx, v.cy, 0, v.cx, v.cy, v.scale * 1.1);
  glow.addColorStop(0, 'rgba(120,140,220,0.13)');
  glow.addColorStop(0.5, 'rgba(90,70,160,0.07)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.lineWidth = Math.max(0.5, dpr * 0.55);
  ctx.strokeStyle = 'rgba(120,160,220,0.16)';
  ctx.beginPath();
  for (const l of g.lanes) {
    const a = toScreen(v, g.stars[l.a]), b = toScreen(v, g.stars[l.b]);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

  for (const s of g.stars) {
    const p = toScreen(v, s);
    const r = dpr * (s.exotic ? 2.4 : 1.5 + Math.min(2.2, Math.log10(1 + s.lum) * 1.5));
    const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
    halo.addColorStop(0, hexA(s.color, 0.38));
    halo.addColorStop(1, hexA(s.color, 0));
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = s.classKey === 'blackHole' ? '#1a1420' : s.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    if (s.classKey === 'blackHole') { ctx.strokeStyle = '#ff9a3c'; ctx.lineWidth = dpr; ctx.stroke(); }
  }

  for (const [s, color, width] of [[state.hoverStar, '#ffffff', 1.2], [state.star, '#5ab0ff', 1.8]]) {
    if (!s) continue;
    const p = toScreen(v, s);
    ctx.strokeStyle = color; ctx.lineWidth = dpr * width;
    ctx.beginPath(); ctx.arc(p.x, p.y, dpr * 9, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = color; ctx.font = `${Math.round(dpr * 11)}px system-ui, sans-serif`;
    ctx.fillText(s.name, p.x + dpr * 12, p.y + dpr * 4);
  }
}
function hexA(hex, a) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Canvas pixel → galaxy space (−1 … 1). */
function galaxyPoint(e) {
  const c = $('galaxy');
  const rect = c.getBoundingClientRect();
  const dpr = c.width / rect.width;
  const v = galaxyView();
  return { x: ((e.clientX - rect.left) * dpr - v.cx) / v.scale, y: ((e.clientY - rect.top) * dpr - v.cy) / v.scale };
}

$('galaxy').addEventListener('mousemove', e => {
  if (!state.galaxy || state.view !== 'galaxy') return;
  const p = galaxyPoint(e);
  const near = nearestStar(state.galaxy, p.x, p.y);
  const hit = near && near.dist < 0.035 ? near.star : null;
  if (hit !== state.hoverStar) { state.hoverStar = hit; drawGalaxy(); }
  const out = $('readout');
  out.innerHTML = '';
  if (hit) {
    out.append(
      el('span', {}, el('b', { text: hit.name })),
      el('span', {}, `class: `, el('b', { text: hit.className })),
      el('span', {}, `light: `, el('b', { text: hit.lum >= 0.01 ? hit.lum.toFixed(2) + '×' : hit.lum.toExponential(1) })),
      el('span', {}, `zone: `, el('b', { text: `${hit.habitable.inner.toFixed(2)}–${hit.habitable.outer.toFixed(2)} AU` })),
      el('span', {}, `lanes: `, el('b', { text: String(hit.neighbours.length) })),
    );
  } else out.append(el('span', { class: 'muted small', text: 'Hover a star for its class, click it to fly in.' }));
});

$('galaxy').addEventListener('click', e => {
  if (!state.galaxy || state.view !== 'galaxy') return;
  const p = galaxyPoint(e);
  const near = nearestStar(state.galaxy, p.x, p.y);
  if (near && near.dist < 0.04) openStar(near.star.id);
});

// ---------------------------------------------------------------------------- map canvas

function drawMap() {
  const c = $('map');
  const box = $('stage').getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.max(320, Math.round(box.width * dpr));
  c.height = Math.max(160, Math.round(box.height * dpr));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, c.width, c.height);
  const layers = { ...state.layers, labels: state.mapLevel !== 'local' };
  const opts = { layer: state.mapLayer, layers };
  if (state.mapLevel === 'world' && state.world) state.mapView = renderWorld(ctx, state.world, opts);
  else if (state.mapLevel === 'region' && state.detail) state.mapView = renderRegion(ctx, state.detail, opts);
  else if (state.mapLevel === 'local' && state.tile) state.mapView = renderLocal(ctx, state.tile, opts);
}

$('map').addEventListener('mousemove', e => {
  if (state.view !== 'map' || !state.mapView) return;
  const rect = $('map').getBoundingClientRect();
  const dpr = $('map').width / rect.width;
  const world = state.mapLevel === 'region' ? state.detail : state.world;
  if (!world || state.mapLevel === 'local') return;
  const cell = cellAt(world, (e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr, state.mapView);
  if (!cell) return;
  const info = cellInfo(world, cell.x, cell.y);
  if (!info) return;
  const out = $('readout');
  out.innerHTML = '';
  out.append(
    el('span', {}, 'biome: ', el('b', { text: info.biomeName })),
    el('span', {}, 'height: ', el('b', { text: info.metres + ' m' })),
    el('span', {}, 'temp: ', el('b', { text: info.temperatureC + ' °C' })),
    el('span', {}, 'region: ', el('b', { text: info.region?.name || '—' })),
  );
});

$('map').addEventListener('click', e => {
  if (state.view !== 'map' || !state.mapView) return;
  const rect = $('map').getBoundingClientRect();
  const dpr = $('map').width / rect.width;
  if (state.mapLevel === 'world') {
    const cell = cellAt(state.world, (e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr, state.mapView);
    if (!cell) return;
    const rid = state.world.region[cell.y * state.world.width + cell.x];
    if (rid < 0) { toast('Open water — pick some land.'); return; }
    openRegion(rid);
  } else if (state.mapLevel === 'region') {
    const cell = cellAt(state.detail, (e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr, state.mapView);
    if (!cell) return;
    const parent = state.detail.parentCell ? state.detail.parentCell[cell.y * state.detail.width + cell.x] : null;
    const wx = parent != null ? parent % state.world.width : Math.round(cell.x / state.detail.factor);
    const wy = parent != null ? Math.floor(parent / state.world.width) : Math.round(cell.y / state.detail.factor);
    openLocal(wx, wy);
  }
});

function openRegion(id) {
  setBusy(true, 'zooming in');
  state.detail = generateRegionDetail(state.world, id, { factor: 5 });
  state.regionId = id;
  state.mapLevel = 'region';
  drawMap(); renderCrumbs(); renderLegend();
  setBusy(false);
  return state.detail;
}

function openLocal(x, y) {
  setBusy(true, 'walking down');
  state.tile = generateLocalDetail(state.world, x, y, { size: 64 });
  state.mapLevel = 'local';
  drawMap(); renderCrumbs(); renderLegend();
  setBusy(false);
  return state.tile;
}

// ---------------------------------------------------------------------------- breadcrumb

function back() {
  if (state.view === 'map' && state.mapLevel === 'local') { state.mapLevel = 'region'; drawMap(); renderCrumbs(); return; }
  if (state.view === 'map' && state.mapLevel === 'region') { state.mapLevel = 'world'; state.detail = null; drawMap(); renderCrumbs(); return; }
  if (state.view === 'map') { showView(state.moon ? 'moon' : 'planet'); return; }
  if (state.view === 'moon') { state.moon = null; state.world = null; buildPlanetScene(state.planet); showView('planet'); renderRight(); return; }
  if (state.view === 'planet') { buildSystemScene(); showView('system'); return; }
  if (state.view === 'system') { showView('galaxy'); return; }
}

function renderCrumbs() {
  const c = $('crumbs');
  c.innerHTML = '';
  const push = (label, fn, here = false) => {
    if (c.children.length) c.append(el('span', { class: 'sep', text: '›' }));
    c.append(here ? el('span', { class: 'here', text: label }) : el('a', { text: label, onclick: fn }));
  };
  push(state.galaxy?.name || 'galaxy', () => showView('galaxy'), state.view === 'galaxy');
  if (state.star) push(state.star.name, () => { buildSystemScene(); showView('system'); }, state.view === 'system');
  if (state.planet) push(state.planet.name, () => { state.moon = null; state.world = null; buildPlanetScene(state.planet); showView('planet'); renderRight(); }, state.view === 'planet');
  if (state.moon) push(state.moon.name, () => { buildPlanetScene(state.moon, state.planet); showView('moon'); }, state.view === 'moon');
  if (state.view === 'map') {
    push('surface', () => { state.mapLevel = 'world'; drawMap(); renderCrumbs(); }, state.mapLevel === 'world');
    if (state.mapLevel !== 'world') push(state.world.regions[state.regionId]?.name || 'region', () => { state.mapLevel = 'region'; drawMap(); renderCrumbs(); }, state.mapLevel === 'region');
    if (state.mapLevel === 'local') push('tile', () => {}, true);
  }
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') back(); });

// ---------------------------------------------------------------------------- legend

function renderLegend() {
  const L = $('legend');
  L.innerHTML = '';
  if (state.view === 'galaxy') {
    for (const c of STAR_CLASSES) {
      L.append(el('span', { class: 'sw' }, el('i', { style: { background: c.key === 'blackHole' ? '#1a1420' : c.color, borderColor: c.key === 'blackHole' ? '#ff9a3c' : 'rgba(0,0,0,.5)' } }), c.name));
    }
  } else if (state.view === 'map' && state.world) {
    const src = state.mapLevel === 'region' ? state.detail : state.world;
    for (const row of legendRows(src, state.mapLayer).slice(0, 14)) {
      L.append(el('span', { class: 'sw' }, el('i', { class: 'sq', style: { background: row.color } }), `${row.label} ${(row.share * 100).toFixed(0)}%`));
    }
  }
}

// ---------------------------------------------------------------------------- left panel (knobs)

function buildLeft() {
  const left = $('left');
  left.innerHTML = '';
  const o = state.opts;
  const set = (k, v) => { o[k] = v; };

  // presets
  const presets = el('div', { class: 'preset-row' });
  for (const name of Object.keys(GALAXY_PRESETS)) {
    presets.append(el('span', {
      class: 'chip', text: name,
      onclick: () => {
        Object.assign(o, GALAXY_PRESETS[name]);
        if (GALAXY_PRESETS[name].mix) o.mix = { ...GALAXY_DEFAULTS.mix, ...GALAXY_PRESETS[name].mix };
        buildLeft(); generate();
      },
    }));
  }

  const seedInput = textInput('seed', String(o.seed), v => set('seed', parseInt(v, 10) || 0));
  seedInput.classList.add('seed-row');

  left.append(panel('Galaxy',
    presets,
    seedInput,
    button('Random seed', () => { o.seed = Math.floor(Math.random() * 1e8); buildLeft(); generate(); }, 'small'),
    select('layout', LAYOUTS, o.layout, v => { set('layout', v); generate(); }),
    knob('stars', { min: 20, max: 900, step: 10, value: o.stars }, v => set('stars', v)),
    knob('arms', { min: 1, max: 8, step: 1, value: o.arms }, v => set('arms', v)),
    knob('twist', { min: 0, max: 2.5, step: 0.05, value: o.twist }, v => set('twist', v)),
    knob('spread', { min: 0, max: 1, step: 0.02, value: o.spread }, v => set('spread', v)),
    knob('core density', { min: 0, max: 1, step: 0.02, value: o.coreDensity }, v => set('coreDensity', v)),
    knob('clusters', { min: 1, max: 14, step: 1, value: o.clusters }, v => set('clusters', v)),
    knob('lanes per star', { min: 1, max: 6, step: 1, value: o.lanes }, v => set('lanes', v)),
    el('p', { class: 'mini', text: 'Layout, star count and the mix below decide what the galaxy map looks like. Everything is rebuilt from the seed.' }),
  ));

  left.append(panel('Star mix',
    knob('hot & bright', { min: 0, max: 4, step: 0.1, value: o.mix.hot }, v => { o.mix.hot = v; }),
    knob('cool & steady', { min: 0, max: 4, step: 0.1, value: o.mix.cool }, v => { o.mix.cool = v; }),
    knob('dying', { min: 0, max: 6, step: 0.1, value: o.mix.dying }, v => { o.mix.dying = v; }),
    knob('exotic', { min: 0, max: 6, step: 0.1, value: o.mix.exotic }, v => { o.mix.exotic = v; }),
    el('p', { class: 'mini', text: 'Multipliers on how common each group is. Exotic covers neutron stars, binary pairs and black holes.' }),
  ));

  left.append(panel('Systems',
    knob('planets per star', { min: 0, max: 1, step: 0.02, value: o.planets }, v => set('planets', v)),
    knob('moons', { min: 0, max: 1, step: 0.02, value: o.moonChance }, v => set('moonChance', v)),
    knob('rings', { min: 0, max: 1, step: 0.02, value: o.ringChance }, v => set('ringChance', v)),
    knob('asteroid belts', { min: 0, max: 1, step: 0.02, value: o.beltChance }, v => set('beltChance', v)),
    knob('comets', { min: 0, max: 1, step: 0.02, value: o.cometChance }, v => set('cometChance', v)),
    knob('rare worlds', { min: 0, max: 1, step: 0.02, value: o.rareWorlds }, v => set('rareWorlds', v)),
    knob('hazard level', { min: 0, max: 1, step: 0.02, value: o.hazardLevel }, v => set('hazardLevel', v)),
    knob('rare element density', { min: 0, max: 1, step: 0.02, value: o.rareDensity }, v => set('rareDensity', v)),
    el('p', { class: 'mini', text: 'These apply the next time a system is opened — click a star to see them.' }),
  ));

  left.append(panel('Names & maps',
    select('name language', RACES, o.nameRace || 'auto', v => { set('nameRace', v === 'auto' ? null : v); generate(); }),
    select('map size', Object.keys(MAP_SIZES), o.mapSize, v => { set('mapSize', v); state.textures.clear(); clearMapCache(); }),
    el('p', { class: 'mini', text: 'Star and planet names come from Name Forge. A bigger map takes longer but zooms in further.' }),
  ));

  left.append(button('Generate galaxy', () => generate(), 'primary'));
  $('left').lastChild.id = 'generate';
}

// ---------------------------------------------------------------------------- right panel

function renderRight() {
  const right = $('right');
  right.innerHTML = '';
  if (!state.galaxy) return;

  // --- what is selected
  if (state.moon) right.append(moonCard(state.moon));
  else if (state.planet) right.append(planetCard(state.planet));
  else if (state.star) right.append(starCard(state.star));
  else right.append(galaxyCard());

  // --- lists
  if (state.planet?.moons?.length) right.append(moonList(state.planet));
  if (state.system) right.append(planetList());
  right.append(starList());
  right.append(exportPanel());
}

function galaxyCard() {
  const g = state.galaxy;
  const rows = el('dl', { class: 'stat-grid' });
  const add = (k, v) => rows.append(el('dt', { text: k }), el('dd', { text: v }));
  add('layout', g.layout);
  add('stars', String(g.stats.stars));
  add('lanes', String(g.stats.lanes));
  add('exotic', String(g.stats.exotic));
  add('avg links', String(g.stats.avgNeighbours));
  const mix = el('div', { class: 'res-row' });
  for (const c of STAR_CLASSES) {
    const n = g.stats.byClass[c.key] || 0;
    if (!n) continue;
    mix.append(el('span', { class: 'res' }, el('i', { style: { background: c.color } }), c.name, el('span', { class: 'amt', text: String(n) })));
  }
  return panel('Galaxy', el('p', { class: 'blurb', text: g.name }), rows, mix);
}

function starCard(star) {
  const rows = el('dl', { class: 'stat-grid' });
  const add = (k, v) => rows.append(el('dt', { text: k }), el('dd', { text: v }));
  add('class', star.className);
  add('surface', star.tempK.toLocaleString() + ' K');
  add('brightness', star.lum >= 0.01 ? star.lum.toFixed(2) + '×' : star.lum.toExponential(1) + '×');
  add('radius', star.radius + '×');
  add('mass', star.mass + '×');
  add('age', star.age + ' bn yr');
  add('water zone', `${star.habitable.inner.toFixed(2)}–${star.habitable.outer.toFixed(2)} AU`);
  add('frost line', star.frostLine.toFixed(2) + ' AU');
  if (state.system) add('planets', `${state.system.stats.planets} (${state.system.stats.living} living)`);
  return panel('Star', el('p', { class: 'blurb', text: starSummary(star) }), rows);
}

function planetCard(p) {
  const rows = el('dl', { class: 'stat-grid' });
  const add = (k, v) => rows.append(el('dt', { text: k }), el('dd', { text: v }));
  add('archetype', p.archetypeName);
  add('orbit', `${p.orbit.au} AU · ${p.orbit.periodDays} d`);
  add('temperature', `${p.temperature.C} °C (${p.temperature.label})`);
  add('radius', p.radius + '×');
  add('gravity', p.gravity + ' g');
  add('day', p.tidalLocked ? 'locked to the star' : p.dayLengthHours + ' h');
  add('air', p.atmosphere.density < 0.05 ? 'none' : `${p.atmosphere.type} · ${p.atmosphere.density} bar${p.atmosphere.breathable ? ' · breathable' : ''}`);
  add('surface', p.giant ? 'no solid ground' : `${p.biomeMode === 'single' ? 'one biome family' : 'many biomes'}${p.poles ? ', ice caps' : ''}`);
  add('moons', String(p.moons.length));
  add('rings', p.rings ? `${p.rings.inner}–${p.rings.outer} radii` : 'none');

  const res = el('div', { class: 'res-row' });
  for (const r of p.resources) res.append(el('span', { class: 'res', title: BASELINE.find(b => b.key === r.key)?.blurb || '' }, el('i', { style: { background: r.color } }), r.name, el('span', { class: 'amt', text: r.abundance.toFixed(2) })));
  for (const r of p.rareElements) res.append(el('span', { class: 'res rare', title: r.blurb }, el('i', { style: { background: r.color } }), r.name, el('span', { class: 'amt', text: r.abundance.toFixed(2) })));

  const haz = el('div', { class: 'hazards' });
  for (const h of p.hazards) haz.append(el('span', { class: 'hazard ' + h, text: h }));
  if (!p.hazards.length) haz.append(el('span', { class: 'muted small', text: 'nothing worse than the weather' }));

  const diff = el('div', { class: 'diffbar' }, el('span', { style: { width: (p.difficulty * 100).toFixed(0) + '%' } }));

  const actions = el('div', { class: 'row' },
    button('Surface map', () => showMap(), 'small'),
    button('Back to system', () => { buildSystemScene(); showView('system'); }, 'small'),
  );

  return panel('Planet',
    el('p', { class: 'blurb', text: planetSummary(p) }),
    rows,
    el('h3', { text: 'Resources' }), res,
    el('h3', { text: 'Hazards' }), haz,
    el('h3', { text: 'Difficulty' }), diff,
    actions, ...mapNote(p),
  );
}

/** The line under the card that says how the surface map came out. */
function mapNote(body) {
  if (state.view !== 'map' || !state.world) return [];
  const mix = mapMix(state.world);
  const share = body.biomeFamily ? familyShare(state.world, body.biomeFamily) : null;
  return [el('p', { class: 'mini', text: `map: ${state.world.width}×${state.world.height}, ${mix.distinct} land biomes, ${(100 * mix.ice / (state.world.width * state.world.height)).toFixed(0)}% ice${share ? `, ${(share.share * 100).toFixed(0)}% of the land is ${body.biomeFamily}` : ''}` })];
}

/** A moon's card. Same shape as a planet's — a moon is a small planet. */
function moonCard(m) {
  const parent = state.planet;
  const rows = el('dl', { class: 'stat-grid' });
  const add = (k, v) => rows.append(el('dt', { text: k }), el('dd', { text: v }));
  add('kind', m.archetypeName);
  add('orbits', `${m.parentName} · ${m.orbit.aroundPlanet} radii · ${m.periodDays} d`);
  add('from the star', `${m.orbit.au} AU`);
  add('temperature', `${m.temperature.C} °C (${m.temperature.label})`);
  add('radius', m.radius + '× Earth');
  add('gravity', m.gravity + ' g');
  add('day', m.tidalLocked ? 'locked to its planet' : m.dayLengthHours + ' h');
  add('air', m.atmosphere.density < 0.02 ? 'none' : `${m.atmosphere.type} · ${m.atmosphere.density} bar${m.atmosphere.breathable ? ' · breathable' : ''}`);
  if (m.tidalHeat > 0) add('tidal heat', (m.tidalHeat * 100).toFixed(0) + '%');

  const res = el('div', { class: 'res-row' });
  for (const r of m.resources) res.append(el('span', { class: 'res', title: BASELINE.find(b => b.key === r.key)?.blurb || '' }, el('i', { style: { background: r.color } }), r.name, el('span', { class: 'amt', text: r.abundance.toFixed(2) })));
  for (const r of m.rareElements) res.append(el('span', { class: 'res rare', title: r.blurb }, el('i', { style: { background: r.color } }), r.name, el('span', { class: 'amt', text: r.abundance.toFixed(2) })));

  const haz = el('div', { class: 'hazards' });
  for (const h of m.hazards) haz.append(el('span', { class: 'hazard ' + h, text: h }));
  if (!m.hazards.length) haz.append(el('span', { class: 'muted small', text: 'nothing worse than the weather' }));

  const actions = el('div', { class: 'row' },
    button('Surface map', () => showMap(), 'small'),
    button(`Back to ${m.parentName}`, () => { state.moon = null; state.world = null; buildPlanetScene(parent); showView('planet'); renderRight(); }, 'small'),
  );

  return panel('Moon',
    el('p', { class: 'blurb', text: m.blurb }),
    rows,
    el('h3', { text: 'Resources' }), res,
    el('h3', { text: 'Hazards' }), haz,
    actions, ...mapNote(m),
  );
}

/** The planet's moons, as a clickable list — the other way in besides clicking one in the 3D view. */
function moonList(planet) {
  const list = el('div', { class: 'list' });
  for (const m of planet.moons) {
    list.append(el('div', {
      class: 'item moon-item' + (state.moon?.id === m.id ? ' on' : ''),
      'data-moon': m.id,
      onclick: () => openMoon(m.id),
    },
    el('span', { class: 'dot', style: { background: m.color } }),
    el('span', { class: 'nm', text: m.name }),
    el('span', { class: 'sub', text: `${m.archetypeName} · ${m.radius}× Earth` })));
  }
  return panel(`Moons of ${planet.name}`, list);
}

function planetList() {
  const list = el('div', { class: 'list' });
  for (const p of state.system.planets) {
    const arch = ARCH_BY_KEY[p.archetype];
    list.append(el('div', {
      class: 'item' + (state.planet?.id === p.id ? ' on' : ''),
      onclick: () => openPlanet(p.id),
    },
    el('span', { class: 'dot', style: { background: arch?.sky || '#888' } }),
    el('span', { class: 'nm', text: p.name }),
    el('span', { class: 'sub', text: `${p.archetypeName} · ${p.orbit.au} AU` })));
  }
  for (const b of state.system.belts) list.append(el('div', { class: 'item' }, el('span', { class: 'dot', style: { background: '#8a8178' } }), el('span', { class: 'nm', text: b.name }), el('span', { class: 'sub', text: `belt · ${b.inner}–${b.outer} AU` })));
  for (const c of state.system.comets) list.append(el('div', { class: 'item' }, el('span', { class: 'dot', style: { background: '#a8e0ff' } }), el('span', { class: 'nm', text: c.name }), el('span', { class: 'sub', text: `comet · ${c.periodYears} yr` })));
  return panel(`${state.system.name} — ${state.system.stats.planets} planets`, list);
}

function starList() {
  const filter = textInput('', state.starFilter, v => { state.starFilter = v.toLowerCase(); fill(); }, { placeholder: 'filter stars…' });
  const list = el('div', { class: 'list' });
  function fill() {
    list.innerHTML = '';
    const rows = state.galaxy.stars
      .filter(s => !state.starFilter || s.name.toLowerCase().includes(state.starFilter) || s.className.toLowerCase().includes(state.starFilter))
      .slice(0, 400);
    for (const s of rows) {
      list.append(el('div', {
        class: 'item' + (state.star?.id === s.id ? ' on' : ''),
        onclick: () => openStar(s.id),
        onmouseenter: () => { state.hoverStar = s; if (state.view === 'galaxy') drawGalaxy(); },
      },
      el('span', { class: 'dot', style: { background: s.classKey === 'blackHole' ? '#1a1420' : s.color } }),
      el('span', { class: 'nm', text: s.name }),
      el('span', { class: 'sub', text: s.className })));
    }
    if (!rows.length) list.append(el('div', { class: 'item muted', text: 'nothing matches' }));
  }
  fill();
  return panel('Stars', el('div', { class: 'filterbar' }, filter), list);
}

function exportPanel() {
  const save = () => toJSON({ galaxy: state.galaxy, system: state.system, planet: state.planet, moon: state.moon });
  return panel('Export',
    el('div', { class: 'row' },
      button('JSON', () => { const j = save(); download(j, `starforge-${state.opts.seed}.json`); toast(`saved ${jsonSizeKB(j)} KB`); }, 'small'),
      button('PNG', () => exportPNG(), 'small'),
      button('Copy link', () => copyLink(), 'small'),
    ),
    el('p', { class: 'mini', text: 'The JSON holds the knobs, the stars and whatever system and planet are open. Surface maps are rebuilt from the planet seed, not saved.' }),
  );
}

function exportPNG() {
  let url = null;
  if (state.view === 'galaxy') url = $('galaxy').toDataURL('image/png');
  else if (state.view === 'map') url = $('map').toDataURL('image/png');
  else if (view3d) url = view3d.snapshot();
  if (!url) return;
  const a = document.createElement('a');
  a.href = url; a.download = `starforge-${state.view}-${state.opts.seed}.png`;
  document.body.append(a); a.click(); a.remove();
  toast('PNG saved');
}

function copyLink() {
  const o = state.opts;
  const hash = new URLSearchParams({ seed: o.seed, stars: o.stars, layout: o.layout, arms: o.arms, twist: o.twist, spread: o.spread, rareWorlds: o.rareWorlds, hazardLevel: o.hazardLevel }).toString();
  const url = location.origin + location.pathname + '#' + hash;
  navigator.clipboard?.writeText(url).then(() => toast('link copied')).catch(() => toast(url));
}

function readHash() {
  if (!location.hash || location.hash.length < 3) return;
  const q = new URLSearchParams(location.hash.slice(1));
  for (const [k, v] of q) {
    if (!(k in state.opts)) continue;
    state.opts[k] = isNaN(+v) ? v : +v;
  }
}

// ---------------------------------------------------------------------------- pixels (tests)

/** Rough statistics about whatever is on screen — used by the Playwright spec. */
/**
 * What is on screen, as numbers. `region` is a box in fractions of the view ({ x, y, w, h }) — the
 * moon view test uses it to look only at where the parent planet is drawn.
 * `cool` counts pixels that are clearly blue or green rather than brown, which is how a real surface
 * texture is told apart from the generic procedural one.
 */
function pixelStats(region = null) {
  let src = null;
  if (state.view === 'galaxy') src = $('galaxy');
  else if (state.view === 'map') src = $('map');
  else if (view3d) src = view3d.renderer.domElement;
  if (!src) return { nonBlack: 0, distinct: 0, cool: 0, brown: 0, pixels: 0 };
  const r = region ? {
    x: Math.round(region.x * src.width), y: Math.round(region.y * src.height),
    w: Math.max(1, Math.round(region.w * src.width)), h: Math.max(1, Math.round(region.h * src.height)),
  } : { x: 0, y: 0, w: src.width, h: src.height };
  const c = document.createElement('canvas');
  c.width = Math.min(320, r.w); c.height = Math.min(160, r.h);
  const ctx = c.getContext('2d');
  ctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const seen = new Set();
  let nonBlack = 0, cool = 0, brown = 0;
  for (let i = 0; i < d.length; i += 4) {
    const R = d[i], G = d[i + 1], B = d[i + 2];
    if (R + G + B > 40) nonBlack++;
    if (R + G + B > 60 && (B > R + 12 || G > R + 12)) cool++;
    if (R + G + B > 60 && R > G + 8 && G > B + 8) brown++;
    seen.add(`${R >> 3},${G >> 3},${B >> 3}`);
  }
  return { nonBlack, distinct: seen.size, cool, brown, pixels: d.length / 4 };
}

// ---------------------------------------------------------------------------- boot

window.addEventListener('resize', () => {
  if (state.view === 'galaxy') drawGalaxy();
  if (state.view === 'map') drawMap();
});

readHash();
try {
  namegen = await NameGen.load('../namegen/data/');
} catch { namegen = null; }

buildLeft();
generate();

window.universeDemo = {
  state, generate, openStar, openPlanet, openMoon, showMap, openRegion, openLocal, showView, back,
  currentBody, orbitLayout: () => state.orbit, parentDrawn: () => parentDrawn,
  setOpt: (k, v) => { state.opts[k] = v; },
  pixelStats, texturesFor,
  elements: { baseline: BASELINE, rare: RARE },
  ready: () => state.ready && !state.busy,
  toJSON: () => toJSON({ galaxy: state.galaxy, system: state.system, planet: state.planet, moon: state.moon }),
};
document.body.dataset.ready = '1';
