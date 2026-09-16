// Farhold — phase 3. Boot the planet, build the scene, run the loop.
//
// Everything the game does is in the modules next door; this file wires them together and owns the
// frame loop. `window.farhold` is the handle the Playwright specs drive.

import * as THREE from 'three';
import { createWorld, makeTerrain, describePlanet, M_PER_CELL } from './planet.js';
import { createTerrainView } from './terrain.js';
import { createSky } from './sky.js';
import { createProps } from './props.js';
import { createFeatures } from './features.js';
import { createWeatherView } from './weather.js';
import { createCombatFx } from './combat-fx.js';
import { createDebugMenu } from './debug.js';
import { createMapScreen } from './map.js';
import { createSaves, snapshot, restore, playtimeText } from './save.js';
import { createInput, createController, KEY_HELP } from './player.js';
import { EnemyField, makeActor, setActorAnim } from './actors.js';
import { Rpg, heldLookFor, offhandLookFor } from './rpg.js';
import { Hud } from './hud.js';
import { atmospherePalette, weatherWeights, weatherOdds, WeatherClock, WEATHER_BY_KEY } from '../../../worldgen/js/weather.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);

const STARTER_WEAPON = {
  warrior: 'longsword', ranger: 'shortbow', rogue: 'dagger', mage: 'wand',
  cleric: 'scepter', dragon_knight: 'sword', stormcaller: 'staff', scavenger: 'dagger',
};

const state = { ready: false, running: false, paused: false, elapsed: 0, frames: 0, playtime: 0 };
const saves = createSaves();

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
  $('boot-name').value = '';

  // ---------------------------------------------------------------- the save list
  function drawSaves() {
    const box = $('boot-saves');
    const list = saves.list();
    box.replaceChildren();
    if (!saves.available()) {
      box.append(Object.assign(document.createElement('p'), { className: 'muted small', textContent: 'This browser will not let the page store saves.' }));
      return;
    }
    if (!list.length) return;
    const head = document.createElement('h3');
    head.textContent = 'Saved runs';
    box.append(head);
    for (const s of list) {
      const row = document.createElement('div');
      row.className = 'save-row';
      row.innerHTML = `<span class="save-name">${s.name || 'Wayfarer'}</span>
        <span class="muted small">level ${s.level} · seed ${s.seed} · ${playtimeText(s.playtime)}${s.place ? ' · ' + s.place : ''}</span>`;
      const load = document.createElement('button');
      load.textContent = 'Load';
      load.onclick = () => begin({ items, balance, bestiary, classLooks, status, save: saves.read(s.id) });
      const del = document.createElement('button');
      del.className = 'ghost';
      del.textContent = '×';
      del.title = 'Delete this save';
      del.onclick = () => { saves.remove(s.id); drawSaves(); };
      row.append(load, del);
      box.append(row);
    }
    const last = saves.lastId();
    if (last && saves.read(last)) {
      const cont = $('boot-continue');
      cont.hidden = false;
      cont.onclick = () => begin({ items, balance, bestiary, classLooks, status, save: saves.read(last) });
    }
  }
  drawSaves();
  status('');

  $('boot-start').onclick = () => {
    $('boot-start').disabled = true;
    begin({ items, balance, bestiary, classLooks, status, save: null }).catch(err => {
      status('failed: ' + err.message);
      $('boot-start').disabled = false;
      console.error(err);
    });
  };

  if (params.has('auto')) $('boot-start').click();
}

async function begin({ items, balance, bestiary, classLooks, status, save }) {
  const seed = save ? save.seed : (Number($('boot-seed').value) || 1);
  const classId = save ? save.classId : $('boot-class').value;
  const lowQuality = params.get('quality') === 'low';

  status('shaping the planet…');
  await frame();
  const { star, system, planet, world } = createWorld({
    seed,
    width: balance.world?.width ?? 256,
    height: balance.world?.height ?? 128,
  });
  const terrain = makeTerrain(world, planet, balance.terrain);
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
  const playerName = save?.name || ($('boot-name').value || '').trim() || look?.name?.split(' ')[0] || 'Wayfarer';
  const player = rpg.createPlayer({ name: playerName, classId, avatar: look?.avatar || null });
  if (!save) {
    const starter = rpg.loot.generate(STARTER_WEAPON[classId] || 'sword', 'normal', 'low', { rng: rpg.rng });
    if (starter) rpg.equip(player, starter);
  }

  // only the player swims, so only the player pays for the swim clips
  const actor = await makeActor({ avatar: JSON.parse(JSON.stringify(look?.avatar || {})), swim: true });
  scene.add(actor.group);

  // the horse, built once and hidden until you press H
  let horse = null;
  try {
    horse = await makeActor({ creature: { type: 'horse', size: 1.25, colors: { body: '#6a4a32', belly: '#8a6a4a', accent: '#2e2018', eyes: '#301c10' } } });
    horse.group.visible = false;
    scene.add(horse.group);
  } catch { horse = null; }

  const control = createController(terrain, balance, camera, { obstacles: [props.solids, features.solids] });
  const input = createInput(renderer.domElement);
  const fx = createCombatFx(scene, {
    onArrowLand: arrow => {
      const splash = balance.player?.arrowSplash ?? 2.6;
      const hits = field.strikeArea(arrow.x, arrow.z, splash, player);
      for (const { enemy, result } of hits) reportHit(enemy, result);
    },
  });

  // ---------------------------------------------------------------- weather
  const weather = new WeatherClock({
    weights: weatherWeights(terrain.climateAt(control.x, control.z)),
    seed,
    minMinutes: balance.weather?.minMinutes ?? 1.2,
    maxMinutes: balance.weather?.maxMinutes ?? 4,
    transitionSeconds: balance.weather?.transitionSeconds ?? 20,
    start: params.get('weather') || save?.weather || null,
  });
  if (params.get('weather')) weather.set(params.get('weather'), { lock: true, instant: true });
  let blended = weather.blend();
  let weatherCell = [-1, -1];

  // ---------------------------------------------------------------- hud + enemies
  const hud = new Hud({
    rpg, terrain, seed,
    onEquip: (item, unequipSlot) => {
      if (unequipSlot) { const off = rpg.unequip(player, unequipSlot); if (off) hud.log(`Took off ${off.name}.`); }
      else { rpg.equip(player, item); hud.log(`Equipped ${item.name}.`, 'loot'); }
      applyGearLook();
      hud.setPlayer(player);
    },
    onSpendAttr: key => { rpg.spendAttr(player, key); hud.setPlayer(player); },
  });
  hud.setPlayer(player);

  function reportHit(enemy, result) {
    if (result.dodged) hud.log(`${enemy.name} dodges.`);
    else hud.log(`You hit ${enemy.name} for ${result.amount}${result.crit ? ' (critical)' : ''}.`, result.crit ? 'good' : '');
  }

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
      autoSave();
    },
  });

  function applyGearLook() {
    const next = JSON.parse(JSON.stringify(look?.avatar || {}));
    next.held = heldLookFor(player.equipment.weapon);
    next.offhand = offhandLookFor(player.equipment.offhand);
    actor.setAvatar(next);        // keeps the clip set it was built with
  }
  applyGearLook();

  // ---------------------------------------------------------------- the map
  const map = createMapScreen({
    terrain, seed,
    getPlayer: () => control,
    getEnemies: () => field.enemies,
    onTeleport: (x, z) => { control.teleport(x, z); rebuildWorldAround(true); field.clear(); },
  });

  // ---------------------------------------------------------------- place the player
  control.teleport(control.spawn.x, control.spawn.z);
  if (save) state.elapsed = restore(save, { rpg, player, control, map }) || 0;
  rebuildWorldAround(true);
  actor.group.position.set(control.x, control.y, control.z);
  applyGearLook();
  hud.setPlayer(player);

  function rebuildWorldAround(force = false) {
    view.update(control.x, control.z, force);
    props.update(control.x, control.z, force);
    features.update(control.x, control.z, force);
  }

  $('hud-planet').textContent = describePlanet(planet, star);
  hud.log(save ? `Welcome back, ${player.name}.` : `You land on ${planet.name}. ${KEY_HELP}`);

  // ---------------------------------------------------------------- saving
  const saveId = save?.id || saves.newId();
  let sinceSave = 0;
  function currentSnapshot() {
    return snapshot({
      id: saveId, name: player.name, seed, classId, player, control,
      elapsed: state.elapsed, playtime: state.playtime,
      pins: map.pins,
      place: features.settlementAt(control.x, control.z)?.name || terrain.regionAt(control.x, control.z) || terrain.biomeAt(control.x, control.z).name,
      weather: blended.key,
    });
  }
  function autoSave({ quiet = true } = {}) {
    const id = saves.write(currentSnapshot());
    if (!quiet) hud.log(id ? 'Saved.' : 'Could not save — this browser is blocking storage.', id ? '' : 'bad');
    sinceSave = 0;
    return id;
  }
  window.addEventListener('beforeunload', () => { try { autoSave(); } catch { /* ignore */ } });

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
        solids: p.solids + f.solids,
        enemies: field.enemies.length, level: player.level,
        swimming: control.swimming ? 'yes' : 'no', mounted: control.mounted ? 'yes' : 'no',
        'view distance': s.viewDistance,
      };
    },
    report: () => {
      const s = view.stats(), p = props.stats(), f = features.stats();
      return [
        'Farhold debug report',
        new Date().toISOString(),
        `planet    ${planet.name} (${planet.archetype}), ${planet.gravity} g, star ${star.name} (${star.className})`,
        `where     ${hud.locationText(control)}`,
        `region    ${terrain.regionAt(control.x, control.z) || '—'}  settlement ${features.settlementAt(control.x, control.z)?.name || '—'}`,
        `player    ${player.name}, ${classId}, level ${player.level}, ${Math.round(player.hp)}/${player.maxHp} hp, ${player.gold} gold, ${player.bag.length} in the bag`,
        `weapon    ${player.equipment.weapon?.name || 'unarmed'}  damage ${player.derived.damage.join('-')}`,
        `state     swimming=${control.swimming} mounted=${control.mounted} grounded=${control.grounded} waterDepth=${control.waterDepth.toFixed(2)}`,
        `weather   ${blended.name} (${blended.key})${weather.locked ? ' held' : ''}  cloud=${blended.cloud.toFixed(2)} rain=${blended.rain.toFixed(2)} fog=${blended.fog.toFixed(2)}`,
        `sky       day ${(sky.dayFraction * 24).toFixed(1)}h  sun.y ${sky.sunDirection.y.toFixed(3)}  eclipse ${sky.eclipse.kind || 'none'} ${sky.eclipse.solar.toFixed(2)}/${sky.eclipse.lunar.toFixed(2)}`,
        `visible   ${sky.visible().map(b => `${b.name} ${b.size.toFixed(1)}`).join(', ') || '—'}`,
        `render    ${renderer.info.render.calls} draw calls, ${renderer.info.render.triangles} triangles, view ${s.viewDistance} m`,
        `world     ${p.instances} props, ${p.grass} grass, ${f.buildings} buildings, ${f.bridges} bridges, ${p.solids + f.solids} solids`,
        `palette   sky ${palette.sky} sea ${palette.sea} cloud ${palette.cloud} extremity ${palette.extremity}`,
        `url       ${location.href}`,
      ].join('\n');
    },
    getWeather: () => ({ key: blended.key, locked: weather.locked, odds: weatherOdds(weather.weights) }),
    setWeather: key => {
      if (key === null) { weather.unlock(); hud.log('Weather back on its own schedule.'); }
      else { weather.set(key, { lock: true }); hud.log(`Weather: ${WEATHER_BY_KEY[key].name}.`); }
    },
    strike: () => weatherView.strike(),
    eclipse: kind => {
      const name = sky.forceEclipse(kind);
      hud.log(name ? `${kind === 'lunar' ? 'Lunar' : 'Solar'} eclipse: ${name}.` : 'No moon to eclipse with.', 'level');
    },
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
      if (!target) { hud.log('Nothing of that kind on this planet.', 'bad'); return; }
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
    save: () => autoSave({ quiet: false }),
  });

  function xpToNext() {
    const next = Math.round(58 * Math.pow(player.level, 1.86));
    return Math.max(1, next - player.xp);
  }

  // ---------------------------------------------------------------- keys that are not movement
  window.addEventListener('keydown', e => {
    if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); hud.toggleSheet(); }
    if (e.code === 'KeyM') { e.preventDefault(); map.toggle(); }
    if (e.code === 'Escape') { if (hud.sheetOpen) hud.toggleSheet(false); else if (map.isOpen) map.toggle(false); }
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
  let lastEclipse = null;

  function tick() {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, clock.getDelta());
    if (state.paused) return;
    state.elapsed += dt;
    state.playtime += dt;
    state.frames++;

    const snap = input.sample();
    const frozen = hud.sheetOpen || debug.isOpen || map.isOpen;
    const step = control.update(dt, snap, { frozen });

    if (step.mountChanged) {
      hud.log(control.mounted ? 'You swing up onto the horse.' : 'You dismount.');
      if (horse) horse.group.visible = control.mounted;
    }
    if (step.enteredWater) hud.log('You wade in and start swimming.');

    // the body follows the controller. Chibi 2 models face +Z, the same way `forward` points.
    actor.group.position.set(control.x, control.y + (control.mounted ? 1.15 : 0), control.z);
    actor.group.rotation.y = control.yaw;
    if (control.swimming) {
      // which stroke depends on the way you are moving relative to the way you face
      if (snap.forward < 0) setActorAnim(actor, 'swimBack');
      else if (!snap.forward && snap.strafe) setActorAnim(actor, 'swimSide');
      else setActorAnim(actor, 'swim');
    } else if (control.mounted) {
      setActorAnim(actor, 'ready');
    } else if (control.swing > 0) setActorAnim(actor, 'attack');
    else if (!control.grounded) setActorAnim(actor, 'jump');
    else if (control.moving > 0) setActorAnim(actor, control.running ? 'run' : 'walk');
    else setActorAnim(actor, 'idle');
    actor.update(dt);

    if (horse) horse.group.visible = control.mounted;
    if (horse && control.mounted) {
      horse.group.position.set(control.x, control.y, control.z);
      horse.group.rotation.y = control.yaw;
      horse.setAnim(control.moving > 6 ? 'run' : control.moving > 0 ? 'walk' : 'idle');
      horse.update(dt);
    }

    // --- attacking
    if (step.attacked) {
      const weapon = player.equipment.weapon;
      const reach = balance.player?.attackReach ?? 2.9;
      const arc = balance.player?.attackArc ?? 1.5;
      if (weapon?.ranged) {
        // a bow: an arrow leaves, flies, and bursts where it lands
        const [fx0, fz0] = control.facing();
        fx.shoot({
          x: control.x + fx0 * 0.7, y: control.y + 1.35, z: control.z + fz0 * 0.7,
          dirX: fx0, dirZ: fz0,
          range: balance.player?.arrowRange ?? 46,
          speed: balance.player?.arrowSpeed ?? 42,
        });
        // if something is directly in the shot, it stops there
        const target = field.hitScan(control.x, control.z, fx0, fz0, { range: balance.player?.arrowRange ?? 46 });
        if (target) {
          const arrow = fx.arrows.find(a => a.live);
          if (arrow) { arrow.range = Math.min(arrow.range, target.distance); }
        }
      } else {
        // a swing: the white arc IS the hit box — same reach, same angle
        fx.swipe({ x: control.x, y: control.y, z: control.z, yaw: control.yaw, reach, arc });
        const hits = field.strike(control, player, { reach, arc });
        for (const { enemy, result } of hits) reportHit(enemy, result);
        // and a little splash damage behind the arc, so nothing is ever purely single-target
        const splash = balance.player?.meleeSplash ?? 1;
        if (splash > 0) {
          const [dx, dz] = control.facing();
          const already = new Set(hits.map(h => h.enemy));
          for (const { enemy, result } of field.strikeArea(control.x + dx * reach * 0.6, control.z + dz * reach * 0.6, splash, player, { falloff: 0.3 })) {
            if (!already.has(enemy)) reportHit(enemy, result);
          }
        }
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
    fx.update(dt);

    sinceRegen += dt;
    if (sinceRegen > 1) {
      sinceRegen = 0;
      player.hp = Math.min(player.maxHp, player.hp + (player.derived.hpRegen || 0));
      player.mp = Math.min(player.maxMp, player.mp + (player.derived.mpRegen || 0));
    }

    rebuildWorldAround(false);

    // --- weather
    const cell = terrain.cellAt(control.x, control.z);
    if (cell.x !== weatherCell[0] || cell.y !== weatherCell[1]) {
      weatherCell = [cell.x, cell.y];
      weather.setWeights(weatherWeights(terrain.climateAt(control.x, control.z)));
    }
    weather.update(dt);
    blended = weather.blend(blended);

    const daylight = Math.max(0, Math.min(1, sky.sunDirection.y * 1.4));
    sky.update(state.elapsed, { gloom: blended.gloom, flash: weatherView.state.flash, cloud: blended.cloud, longitude: control.x / terrain.widthM });
    weatherView.update(dt, blended, { camera, daylight, sunDir: sky.sunDirection, baseFogColor: sky.fog.color });
    scene.fog.color.copy(weatherView.fogColor);
    scene.fog.far = weatherView.fogFar;
    scene.fog.near = weatherView.fogNear;

    // --- an eclipse is worth announcing
    const kind = sky.eclipse.kind;
    // No banner: it covered the sky at the exact moment there was something worth looking at.
    // The log line is enough.
    if (kind && kind !== lastEclipse) {
      hud.log(kind === 'solar'
        ? `A solar eclipse begins — ${sky.eclipse.body} crosses the sun.`
        : `A lunar eclipse begins — ${sky.eclipse.body} enters the shadow.`, 'level');
    }
    lastEclipse = kind;

    // --- saving
    sinceSave += dt;
    if (sinceSave > (balance.save?.autoSaveSeconds ?? 45)) autoSave();

    const target = field.target(control);
    const town = features.settlementAt(control.x, control.z);
    hud.tick(player, {
      place: town ? `${town.name} (${town.kind || 'settlement'})` : (terrain.regionAt(control.x, control.z) || terrain.biomeAt(control.x, control.z).name),
      clock: clockText(sky.dayFraction, control),
      target,
      sky: skyText(sky),
      weather: blended.name + (weather.locked ? ' · held' : '') + (control.swimming ? ' · swimming' : '') + (control.mounted ? ' · riding' : ''),
      where: hud.locationText(control),
    });
    if (state.frames % 6 === 0) hud.drawMinimap(control, field.enemies);
    if (state.frames % 12 === 0) map.tick();

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
    autoSave();
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
  autoSave();
  tick();

  // ---------------------------------------------------------------- test handle
  window.farhold = {
    THREE, renderer, scene, camera, sky, view, props, features, weatherView, weather, debug, map, fx,
    terrain, world, planet, star, system, palette, saves, horse,
    rpg, player, control, field, hud, actor, balance, state,
    saveNow: () => autoSave({ quiet: false }),
    snapshot: currentSnapshot,
    stats: () => ({
      ...view.stats(),
      props: props.stats(),
      features: features.stats(),
      weather: { ...blended },
      eclipse: { ...sky.eclipse },
      enemies: field.enemies.length,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      level: player.level, hp: player.hp, bag: player.bag.length,
      height: control.y, x: control.x, z: control.z,
      pitch: control.pitch, camDistance: control.camDistanceUsed,
      swimming: control.swimming, mounted: control.mounted, waterDepth: control.waterDepth,
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

function frame() { return new Promise(r => requestAnimationFrame(() => r())); }

boot().catch(err => {
  document.getElementById('boot-status').textContent = 'failed: ' + err.message;
  console.error(err);
});
