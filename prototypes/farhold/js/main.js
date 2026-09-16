// Farhold — phase 2. Boot the planet, build the scene, run the loop.
//
// Everything the game does is in the modules next door; this file wires them together and owns the
// frame loop. `window.farhold` is the handle the Playwright spec drives.

import * as THREE from 'three';
import { createWorld, makeTerrain, describePlanet, M_PER_CELL } from './planet.js';
import { createTerrainView } from './terrain.js';
import { createSky } from './sky.js';
import { createProps } from './props.js';
import { createFeatures } from './features.js';
import { createWeatherView } from './weather.js';
import { createDebugMenu } from './debug.js';
import { createInput, createController, KEY_HELP } from './player.js';
import { EnemyField, makeActor, setActorAnim } from './actors.js';
import { Rpg, heldLookFor, offhandLookFor } from './rpg.js';
import { Hud } from './hud.js';
import { atmospherePalette, weatherWeights, weatherOdds, WeatherClock, WEATHER_BY_KEY } from '../../../worldgen/js/weather.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);

/** A starting weapon that suits the class's own look. */
const STARTER_WEAPON = {
  warrior: 'longsword', ranger: 'shortbow', rogue: 'dagger', mage: 'wand',
  cleric: 'scepter', dragon_knight: 'sword', stormcaller: 'staff', scavenger: 'dagger',
};

const state = { ready: false, running: false, paused: false, elapsed: 0, frames: 0 };

async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not load ${url} (${res.status})`);
  return res.json();
}

async function boot() {
  const status = t => { $('boot-status').textContent = t; };
  status('reading the data…');

  const [items, balance, bestiary, classLooks] = await Promise.all([
    loadJSON('../emberveil/data/items.json'),
    loadJSON('data/balance.json'),
    loadJSON('data/enemies.json'),
    loadJSON('../emberveil/data/class-looks.json'),
  ]);

  const classIds = Object.keys(STARTER_WEAPON).filter(id => classLooks.classes[id]);
  const select = $('boot-class');
  select.replaceChildren(...classIds.map(id => {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = classLooks.classes[id].className || id;
    return o;
  }));
  select.value = 'ranger';
  $('boot-seed').value = params.get('seed') || String(balance.seed ?? 1);
  status('');

  $('boot-start').onclick = () => {
    $('boot-start').disabled = true;
    start({ items, balance, bestiary, classLooks, status }).catch(err => {
      status('failed: ' + err.message);
      $('boot-start').disabled = false;
      console.error(err);
    });
  };

  if (params.has('auto')) $('boot-start').click();
}

async function start({ items, balance, bestiary, classLooks, status }) {
  const seed = Number($('boot-seed').value) || 1;
  const classId = $('boot-class').value;
  const lowQuality = params.get('quality') === 'low';

  status('shaping the planet…');
  await frame();
  const { star, system, planet, world } = createWorld({
    seed,
    width: balance.world?.width ?? 256,
    height: balance.world?.height ?? 128,
  });
  const terrain = makeTerrain(world, planet, balance.terrain);
  // this world's own colours: sky, sea and cloud, varied from the archetype by the planet's seed
  const palette = atmospherePalette(planet);

  status('finding somewhere to stand…');
  await frame();

  // ---------------------------------------------------------------- renderer
  const renderer = new THREE.WebGLRenderer({ antialias: !lowQuality, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(lowQuality ? 1 : Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = false;
  $('stage').append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.2, 24000);

  const sky = createSky({ star, system, planet, balance, palette });
  scene.add(sky.sunLight);
  scene.add(sky.sunLight.target);
  scene.add(sky.ambient);
  scene.fog = sky.fog;

  const ringSpec = lowQuality ? balance.terrain?.ringsLow : balance.terrain?.rings;
  const view = createTerrainView(scene, terrain, { rings: ringSpec, waterColor: palette.sea });

  status('planting the world…');
  await frame();
  const props = createProps(scene, terrain, {
    seed,
    density: lowQuality ? 0.45 : (balance.props?.density ?? 1),
    radius: lowQuality ? 4 : (balance.props?.radius ?? 7),
    grassPerCell: lowQuality ? 60 : (balance.props?.grassPerCell ?? 150),
  });
  const features = createFeatures(scene, terrain, {
    palette, seed, radius: lowQuality ? 1500 : (balance.features?.radius ?? 2600),
  });
  const weatherView = createWeatherView({
    scene, skyScene: sky.scene, palette, seed, quality: lowQuality ? 'low' : 'high',
  });

  // ---------------------------------------------------------------- the player
  status('waking the wayfarer…');
  await frame();

  const rpg = new Rpg(items, { ...balance, seed });
  const look = classLooks.classes[classId];
  const player = rpg.createPlayer({
    name: look?.name?.split(' ')[0] || 'Wayfarer',
    classId,
    avatar: look?.avatar || null,
  });
  const starter = rpg.loot.generate(STARTER_WEAPON[classId] || 'sword', 'normal', 'low', { rng: rpg.rng });
  if (starter) rpg.equip(player, starter);

  const actor = await makeActor({ avatar: JSON.parse(JSON.stringify(look?.avatar || {})) });
  scene.add(actor.group);

  const control = createController(terrain, balance, camera);
  const input = createInput(renderer.domElement);

  // ---------------------------------------------------------------- weather
  const weather = new WeatherClock({
    weights: weatherWeights(terrain.climateAt(control.x, control.z)),
    seed,
    minMinutes: balance.weather?.minMinutes ?? 1.2,
    maxMinutes: balance.weather?.maxMinutes ?? 4,
    transitionSeconds: balance.weather?.transitionSeconds ?? 20,
    start: params.get('weather') || null,
  });
  if (params.get('weather')) weather.set(params.get('weather'), { lock: true, instant: true });
  let blended = weather.blend();
  let weatherCell = [-1, -1];

  // ---------------------------------------------------------------- hud + enemies
  const hud = new Hud({
    rpg, terrain,
    onEquip: (item, unequipSlot) => {
      if (unequipSlot) { const off = rpg.unequip(player, unequipSlot); if (off) hud.log(`Took off ${off.name}.`); }
      else { rpg.equip(player, item); hud.log(`Equipped ${item.name}.`, 'loot'); }
      applyGearLook();
      hud.setPlayer(player);
    },
    onSpendAttr: key => { rpg.spendAttr(player, key); hud.setPlayer(player); },
  });
  hud.setPlayer(player);

  const field = new EnemyField({
    scene, terrain, rpg, defs: bestiary.enemies, balance: { ...balance, seed },
    onLog: (t, c) => hud.log(t, c),
    onKill: e => {
      player.kills++;
      const levels = rpg.gainXp(player, e.xp);
      player.gold += e.gold;
      hud.log(`${e.name} falls. +${e.xp} xp, +${e.gold} gold.`, 'good');
      if (levels) hud.log(`Level ${player.level}! ${levels * (balance.progression?.attrPerLevel ?? 3)} points to spend (press I).`, 'level');
      const drop = rpg.rollDrop({ level: e.level, rng: field.rng, magicFind: player.derived.magicFind, bases: e.dropBases });
      if (drop) { player.bag.push(drop); hud.log(`${e.name} dropped ${drop.name}.`, 'loot'); }
      hud.setPlayer(player);
    },
  });

  function applyGearLook() {
    const next = JSON.parse(JSON.stringify(look?.avatar || {}));
    next.held = heldLookFor(player.equipment.weapon);
    next.offhand = offhandLookFor(player.equipment.offhand);
    actor.setAvatar(next);
  }
  applyGearLook();

  // ---------------------------------------------------------------- place the player
  control.teleport(control.spawn.x, control.spawn.z);
  rebuildWorldAround(true);
  actor.group.position.set(control.x, control.y, control.z);

  function rebuildWorldAround(force = false) {
    view.update(control.x, control.z, force);
    props.update(control.x, control.z, force);
    features.update(control.x, control.z, force);
  }

  $('hud-planet').textContent = describePlanet(planet, star);
  hud.log(`You land on ${planet.name}. ${KEY_HELP}`);
  hud.log('Press ` for the debug menu.');

  // ---------------------------------------------------------------- debug menu
  const shown = { props: true, grass: true, features: true };
  const debug = createDebugMenu({
    getState: () => {
      const s = view.stats(), p = props.stats(), f = features.stats();
      return {
        seed, planet: planet.name, biome: terrain.biomeAt(control.x, control.z).name,
        x: Math.round(control.x), z: Math.round(control.z), altitude: Math.round(control.y),
        'draw calls': renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        props: p.instances, grass: p.grass, buildings: f.buildings,
        enemies: field.enemies.length, level: player.level,
        'view distance': s.viewDistance,
      };
    },
    getWeather: () => ({
      key: blended.key, locked: weather.locked,
      odds: weatherOdds(weather.weights),
    }),
    setWeather: key => {
      if (key === null) { weather.unlock(); hud.log('Weather back on its own schedule.'); }
      else { weather.set(key, { lock: true }); hud.log(`Weather: ${WEATHER_BY_KEY[key].name}.`); }
    },
    strike: () => weatherView.strike(),
    getTime: () => sky.dayFraction,
    setTime: fraction => {
      const dayLength = balance.sky?.dayLengthSeconds ?? 900;
      const startFraction = balance.sky?.startFraction ?? 0.34;
      state.elapsed = ((fraction - startFraction + 1) % 1) * dayLength;
      sky.update(state.elapsed, { gloom: blended.gloom, cloud: blended.cloud });
    },
    setDensity: d => { props.setDensity(d, control.x, control.z); },
    toggleProps: () => { shown.props = !shown.props; props.setVisible(shown.props, control.x, control.z); },
    toggleGrass: () => { shown.grass = !shown.grass; props.setGrass(shown.grass, control.x, control.z); },
    toggleFeatures: () => { shown.features = !shown.features; features.setVisible(shown.features, control.x, control.z); },
    teleport: kind => {
      let target = null;
      if (kind === 'random') {
        const p = terrain.spawnPoint(Math.random);
        target = { wx: p.x, wz: p.z };
      } else if (kind === 'peak') {
        let best = null;
        for (let i = 0; i < 300; i++) {
          const x = Math.random() * terrain.widthM, z = Math.random() * terrain.depthM;
          const h = terrain.heightAt(x, z);
          if (!best || h > best.h) best = { wx: x, wz: z, h };
        }
        target = best;
      } else {
        target = features.nearest(kind, control.x, control.z);
      }
      if (!target) { hud.log(`Nothing of that kind on this planet.`, 'bad'); return; }
      control.teleport(target.wx, target.wz);
      rebuildWorldAround(true);
      field.clear();
      hud.log(`Moved to ${target.name || kind}.`);
    },
    levelUp: () => { rpg.gainXp(player, xpToNext()); hud.log(`Level ${player.level}.`, 'level'); hud.setPlayer(player); },
    heal: () => { player.hp = player.maxHp; player.mp = player.maxMp; hud.setPlayer(player); },
    give: rarity => {
      const bases = rpg.basesFor(player.level);
      const item = rpg.loot.generate(field.rng.pick(bases), rarity, 'high', { rng: rpg.rng });
      if (item) { player.bag.push(item); hud.log(`Given ${item.name}.`, 'loot'); hud.setPlayer(player); }
    },
    spawn: () => { field.spawnNear(control.x, control.z, player.level); },
    clearEnemies: () => field.clear(),
  });

  /** XP needed to reach the next level, for the debug "level up" button. */
  function xpToNext() {
    const next = Math.round(58 * Math.pow(player.level, 1.86));
    return Math.max(1, next - player.xp);
  }

  // ---------------------------------------------------------------- input that is not movement
  window.addEventListener('keydown', e => {
    if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); hud.toggleSheet(); }
    if (e.code === 'Escape' && hud.sheetOpen) hud.toggleSheet(false);
  });

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- the loop
  const clock = new THREE.Clock();
  let sinceRegen = 0;

  function tick() {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, clock.getDelta());
    if (state.paused) return;
    state.elapsed += dt;
    state.frames++;

    const snapshot = input.sample();
    const frozen = hud.sheetOpen || debug.isOpen;
    const step = control.update(dt, snapshot, { frozen });

    // the body follows the controller. Chibi 2 models face +Z, which is the same way `forward`
    // points, so the yaw goes on as it is — adding a half turn is what had them walking backwards.
    actor.group.position.set(control.x, control.y, control.z);
    actor.group.rotation.y = control.yaw;
    if (control.swing > 0) setActorAnim(actor, 'attack');
    else if (!control.grounded) setActorAnim(actor, 'jump');
    else if (control.moving > 0) setActorAnim(actor, control.running ? 'run' : 'walk');
    else setActorAnim(actor, 'idle');
    actor.update(dt);

    if (step.attacked) {
      const hits = field.strike(control, player, {
        reach: balance.player?.attackReach ?? 2.9,
        arc: balance.player?.attackArc ?? 1.5,
      });
      for (const { enemy, result } of hits) {
        if (result.dodged) hud.log(`${enemy.name} dodges.`);
        else hud.log(`You hit ${enemy.name} for ${result.amount}${result.crit ? ' (critical)' : ''}.`, result.crit ? 'good' : '');
      }
    }

    field.update(dt, control, player, {
      onEnemyStrike: e => {
        const result = rpg.strike(e, player, field.rng);
        if (result.dodged) { hud.log(`You dodge ${e.name}.`); return; }
        hud.log(`${e.name} hits you for ${result.amount}.`, 'bad');
        if (player.hp <= 0) respawn();
      },
    });

    sinceRegen += dt;
    if (sinceRegen > 1) {
      sinceRegen = 0;
      player.hp = Math.min(player.maxHp, player.hp + (player.derived.hpRegen || 0));
      player.mp = Math.min(player.maxMp, player.mp + (player.derived.mpRegen || 0));
    }

    // --- the world around the player
    rebuildWorldAround(false);

    // --- weather: the climate under your feet decides what is possible here
    const cell = terrain.cellAt(control.x, control.z);
    if (cell.x !== weatherCell[0] || cell.y !== weatherCell[1]) {
      weatherCell = [cell.x, cell.y];
      weather.setWeights(weatherWeights(terrain.climateAt(control.x, control.z)));
    }
    weather.update(dt);
    blended = weather.blend(blended);

    const daylight = Math.max(0, Math.min(1, sky.sunDirection.y * 1.4));
    sky.update(state.elapsed, { gloom: blended.gloom, flash: weatherView.state.flash, cloud: blended.cloud });
    weatherView.update(dt, blended, { camera, daylight, sunDir: sky.sunDirection, baseFogColor: sky.fog.color });
    scene.fog.color.copy(weatherView.fogColor);
    scene.fog.far = weatherView.fogFar;
    scene.fog.near = weatherView.fogNear;

    const target = field.target(control);
    const town = features.settlementAt(control.x, control.z);
    hud.tick(player, {
      place: town ? `${town.name} (${town.kind || 'settlement'})` : (terrain.regionAt(control.x, control.z) || terrain.biomeAt(control.x, control.z).name),
      clock: clockText(sky.dayFraction, control),
      target,
      sky: skyText(sky),
      weather: blended.name + (weather.locked ? ' · held' : ''),
    });
    if (state.frames % 6 === 0) hud.drawMinimap(control, field.enemies);

    renderer.clear();
    renderer.render(sky.scene, sky.camera(camera));
    renderer.clearDepth();
    renderer.render(scene, camera);
    document.body.dataset.ready = '1';
    state.ready = true;
  }

  function respawn() {
    hud.log('You black out, and wake where you landed.', 'bad');
    player.deaths++;
    player.hp = Math.round(player.maxHp * 0.5);
    player.gold = Math.round(player.gold * 0.9);
    control.teleport(control.spawn.x, control.spawn.z);
    field.clear();
    rebuildWorldAround(true);
  }

  function clockText(fraction, c) {
    const hours = Math.floor(fraction * 24), minutes = Math.floor((fraction * 24 % 1) * 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} · ${Math.round(c.y)} m`;
  }
  function skyText(s) {
    const up = s.visible().slice(0, 2);
    if (!up.length) return '';
    return up.map(b => b.name).join(', ') + (s.isNight ? ' overhead' : ' in the daylight');
  }

  $('boot').classList.add('hidden');
  state.running = true;
  tick();

  // ---------------------------------------------------------------- test handle
  window.farhold = {
    THREE, renderer, scene, camera, sky, view, props, features, weatherView, weather, debug,
    terrain, world, planet, star, system, palette,
    rpg, player, control, field, hud, actor, balance, state,
    stats: () => ({
      ...view.stats(),
      props: props.stats(),
      features: features.stats(),
      weather: { ...blended },
      enemies: field.enemies.length,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      level: player.level, hp: player.hp, bag: player.bag.length,
      height: control.y, x: control.x, z: control.z,
      pitch: control.pitch, camDistance: control.camDistanceUsed,
      dayFraction: sky.dayFraction, sunY: sky.sunDirection.y,
      sky: sky.visible(),
    }),
    teleport: (x, z) => { control.teleport(x, z); rebuildWorldAround(true); },
    setWeather: (key, lock = true) => { if (key === null) weather.unlock(); else weather.set(key, { lock, instant: true }); blended = weather.blend(blended); return blended; },
    setTime: t => { state.elapsed = t; sky.update(t, { gloom: blended.gloom, cloud: blended.cloud }); },
    spawn: async (defId, level = player.level) => {
      const def = bestiary.enemies.find(d => d.id === defId) || bestiary.enemies[0];
      return field.add(def, level, control.x + 3, control.z + 3);
    },
    hit: () => field.strike(control, player, { reach: 9, arc: 6.3 }),
    give: (baseKey, rarity = 'rare') => {
      const item = rpg.loot.generate(baseKey, rarity, 'high', { rng: rpg.rng });
      if (item) player.bag.push(item);
      hud.setPlayer(player);
      return item;
    },
    pause: v => { state.paused = v; },
  };
}

/** Let the browser paint the loading message before we block it for half a second. */
function frame() { return new Promise(r => requestAnimationFrame(() => r())); }

boot().catch(err => {
  document.getElementById('boot-status').textContent = 'failed: ' + err.message;
  console.error(err);
});
