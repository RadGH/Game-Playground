// Farhold — phase 3. Boot the planet, build the scene, run the loop.
//
// Everything the game does is in the modules next door; this file wires them together and owns the
// frame loop. `window.farhold` is the handle the Playwright specs drive.

import * as THREE from 'three';
import { createWorld, makeTerrain, describePlanet, M_PER_CELL } from './planet.js';
import { createSpace } from './space.js';
import { createTownFolk } from './town.js';
import { createTalkPanel } from './talkui.js';
import { QuestLog } from './quests.js';
import { Campaign } from './campaign.js';
import { createSound } from './sound.js';
import { createSpeech } from './speech.js';
import { NameGen } from '../../../namegen/js/namegen.js';
import { generatePlanetMap } from '../../../universe/js/planetmap.js';
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

  const [items, balance, bestiary, talents, campaignData, classLooks, namegen] = await Promise.all([
    loadJSON('../emberveil/data/items.json'),
    loadJSON('data/balance.json'),
    loadJSON('data/enemies.json'),
    loadJSON('data/talents.json'),
    loadJSON('data/campaign.json'),
    loadJSON('../emberveil/data/class-looks.json'),
    // Name Forge, so the folk in a dwarf town have dwarf names
    NameGen.load('/namegen/data/').catch(() => null),
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
      load.onclick = () => begin({ items, balance, bestiary, talents, campaignData, classLooks, namegen, status, save: saves.read(s.id) });
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
      cont.onclick = () => begin({ items, balance, bestiary, talents, campaignData, classLooks, namegen, status, save: saves.read(last) });
    }
  }
  drawSaves();
  status('');

  $('boot-start').onclick = () => {
    $('boot-start').disabled = true;
    begin({ items, balance, bestiary, talents, campaignData, classLooks, namegen, status, save: null }).catch(err => {
      status('failed: ' + err.message);
      $('boot-start').disabled = false;
      console.error(err);
    });
  };

  if (params.has('auto')) $('boot-start').click();
}

async function begin({ items, balance, bestiary, talents, campaignData, classLooks, namegen, status, save }) {
  const seed = save ? save.seed : (Number($('boot-seed').value) || 1);
  const classId = save ? save.classId : $('boot-class').value;
  const lowQuality = params.get('quality') === 'low';

  status('shaping the planet…');
  await frame();
  const mapSize = { width: balance.world?.width ?? 256, height: balance.world?.height ?? 128 };
  const created = createWorld({ seed, ...mapSize });
  const { star, system } = created;
  // these are replaced wholesale when you land on a different world
  let planet = created.planet, world = created.world;
  let terrain = makeTerrain(world, planet, balance.terrain);
  let palette = atmospherePalette(planet);

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

  let sky = createSky({ star, system, planet, balance, palette });
  scene.add(sky.sunLight);
  scene.add(sky.sunLight.target);
  scene.add(sky.ambient);
  scene.fog = sky.fog;

  const ringSpec = lowQuality ? balance.terrain?.ringsLow : balance.terrain?.rings;
  let view = createTerrainView(scene, terrain, { rings: ringSpec, waterColor: palette.sea });

  status('planting the world…');
  await frame();
  let props = createProps(scene, terrain, {
    seed,
    density: lowQuality ? 0.45 : (balance.props?.density ?? 1),
    radius: lowQuality ? 4 : (balance.props?.radius ?? 7),
    grassPerCell: lowQuality ? 60 : (balance.props?.grassPerCell ?? 150),
  });
  let features = createFeatures(scene, terrain, {
    palette, seed, radius: lowQuality ? 1500 : (balance.features?.radius ?? 2600),
  });
  let weatherView = createWeatherView({
    scene, skyScene: sky.scene, palette, seed, quality: lowQuality ? 'low' : 'high',
  });

  // phase 7: sound and speech. Both start silent and come up on the first click, because a
  // browser will not give a page an audio context until somebody has interacted with it.
  const sound = await createSound({ balance, enabled: params.get('sound') !== 'off' });
  const speech = await createSpeech({ enabled: params.get('sound') !== 'off' });
  const wake = () => { sound.start(); window.removeEventListener('pointerdown', wake); window.removeEventListener('keydown', wake); };
  window.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', wake);

  // the folk who live in the settlements, and the work they hand out
  const questLog = save?.quests ? QuestLog.fromJSON(save.quests) : new QuestLog();
  const campaign = new Campaign(campaignData, save?.campaign || null);
  const npcLooks = ['ranger', 'cleric', 'rogue', 'warrior', 'bard', 'mage']
    .map(id => classLooks.classes[id]?.avatar).filter(Boolean);
  let folk = null;

  // ---------------------------------------------------------------- the player
  status('waking the wayfarer…');
  await frame();

  const rpg = new Rpg(items, { ...balance, seed }, talents);
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

  let control = createController(terrain, balance, camera, { obstacles: [props.solids, features.solids] });
  const input = createInput(renderer.domElement);
  const fx = createCombatFx(scene, {
    // `terrain` is replaced when you land on a new world, so read it through the binding
    groundAt: (x, z) => terrain.heightAt(x, z),
    onArrowLand: arrow => {
      const splash = balance.player?.arrowSplash ?? 2.6;
      const hits = field.strikeArea(arrow.x, arrow.z, splash, player);
      sound.combat('arrow');
      for (const { enemy, result } of hits) reportHit(enemy, result);
    },
  });

  // ---------------------------------------------------------------- weather
  let weather = new WeatherClock({
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
      else { rpg.equip(player, item); hud.log(`Equipped ${item.name}.`, 'loot'); sound.equip(); }
      applyGearLook();
      hud.setPlayer(player);
    },
    onSpendAttr: key => { rpg.spendAttr(player, key); hud.setPlayer(player); },
    journal: () => ({
      title: campaignData.title,
      share: campaign.share,
      objectives: campaign.list(),
      nemesis: campaign.nemesis,
      quests: questLog.active.map(q => ({ title: q.title, progress: questLog.progressText(q), done: q.done })),
      bestiary: campaign.bestiary,
      names: Object.fromEntries(bestiary.enemies.map(e => [e.id, e.name])),
    }),
    onTakeTalent: id => { if (rpg.takeTalent(player, id)) { sound.ui('click'); hud.log(`Talent taken: ${rpg.talentList.find(t => t.id === id)?.name}.`, 'level'); autoSave(); } hud.setPlayer(player); },
    onSpendPassive: id => { if (rpg.spendPassive(player, id)) { sound.ui('click'); autoSave(); } hud.setPlayer(player); },
  });
  hud.setPlayer(player);

  function reportHit(enemy, result) {
    if (result.dodged) hud.log(`${enemy.name} dodges.`);
    else hud.log(`You hit ${enemy.name} for ${result.amount}${result.crit ? ' (critical)' : ''}.`, result.crit ? 'good' : '');
  }

  /** What happens when something dies. Named, because the enemy field is rebuilt on every world. */
  function onEnemyKilled(e) {
    player.kills++;
    sound.combat('death', { beast: e.kind !== 'humanoid' });
    const settled = campaign.onKill(e.defId);
    if (settled === 'nemesis') {
      hud.log('The grudge is settled.', 'level');
      sound.questDone();
    }
    const back = rpg.onKillRestore(player);
    if (back.hp || back.mp) hud.log(`The kill returns ${[back.hp && `${back.hp} health`, back.mp && `${back.mp} mana`].filter(Boolean).join(' and ')}.`);
    const levels = rpg.gainXp(player, e.xp);
    player.gold += e.gold;
    hud.log(`${e.name} falls. +${e.xp} xp, +${e.gold} gold.`, 'good');
    if (levels) { hud.log(`Level ${player.level}! ${levels * (balance.progression?.attrPerLevel ?? 3)} points to spend (press I).`, 'level'); sound.levelUp(); }
    const drop = rpg.rollDrop({ level: e.level, rng: field.rng, magicFind: player.derived.magicFind, bases: e.dropBases });
    if (drop) {
      player.bag.push(drop);
      hud.log(`${e.name} dropped ${drop.name}.`, 'loot');
      sound.loot(drop);
      campaign.onLoot(drop);
      for (const q of questLog.onLoot({ baseKey: drop.baseKey })) hud.log(`${q.title}: ${questLog.progressText(q)}`, q.done ? 'good' : '');
    }
    for (const q of questLog.onKill({ defId: e.defId })) hud.log(`${q.title}: ${questLog.progressText(q)}`, q.done ? 'good' : '');
    hud.setPlayer(player);
    autoSave();
  }

  function makeField() {
    return new EnemyField({
      scene, terrain, rpg, defs: bestiary.enemies, balance: { ...balance, seed },
      onLog: (t, c) => hud.log(t, c),
      onKill: onEnemyKilled,
    });
  }
  let field = makeField();

  function applyGearLook() {
    const next = JSON.parse(JSON.stringify(look?.avatar || {}));
    next.held = heldLookFor(player.equipment.weapon);
    next.offhand = offhandLookFor(player.equipment.offhand);
    // phase 8: armour you can see — the base's tier picks the Chibi 2 part
    Object.assign(next, rpg.gearLook(player));
    actor.setAvatar(next);        // keeps the clip set it was built with
  }
  applyGearLook();

  // ---------------------------------------------------------------- the map
  let map = null;
  map = makeMap();
  folk = makeFolk();

  // ---------------------------------------------------------------- talking to people
  function talkContext(npc) {
    return {
      gold: player.gold,
      stock: npc.trades ? folk.stockFor(npc, player.level) : [],
      bag: player.bag,
      offer: folk.questFrom(npc, { level: player.level, enemies: bestiary.enemies, nodes: world.nodes }),
      active: questLog.active,
      hasQuest: id => questLog.has(id),
      readyToTurnIn: giverId => questLog.readyToTurnIn(giverId),
      progressText: q => questLog.progressText(q),
    };
  }

  const talk = createTalkPanel({
    describe: item => hud.describe(item),
    price: item => Math.max(1, Math.round(rpg.price(item) * campaign.priceMultiplier(talk.npc?.node?.id))),
    sellPrice: item => Math.max(1, Math.round(rpg.price(item) * (items.sellFactor ?? 0.35))),
    buy: item => {
      const r = folk.buy(talk.npc, item, player, campaign.priceMultiplier(talk.npc?.node?.id));
      hud.log(r.ok ? `Bought ${item.name} for ${r.price} gold.` : r.why, r.ok ? 'loot' : 'bad');
      if (r.ok) sound.coin(); else sound.ui('error');
      hud.setPlayer(player);
      talk.update(talkContext(talk.npc));
      autoSave();
    },
    sell: item => {
      const r = folk.sell(talk.npc, item, player);
      hud.log(r.ok ? `Sold ${item.name} for ${r.price} gold.` : r.why, r.ok ? '' : 'bad');
      if (r.ok) sound.coin();
      hud.setPlayer(player);
      talk.update(talkContext(talk.npc));
      autoSave();
    },
    accept: quest => {
      questLog.add(quest);
      hud.log(`Took the job: ${quest.title}.`, 'level');
      if (quest.place) map.addPin(quest.place.cell.x, quest.place.cell.y, quest.place.name);
      talk.update(talkContext(talk.npc));
      autoSave();
    },
    turnIn: quest => {
      const reward = questLog.turnIn(quest);
      campaign.onQuestDone(quest, talk.npc?.node?.id ?? null);
      player.gold += reward.gold;
      const levels = rpg.gainXp(player, reward.xp);
      hud.log(`${quest.title} — done. ${reward.gold} gold, ${reward.xp} xp.`, 'good');
      sound.questDone();
      if (levels) hud.log(`Level ${player.level}!`, 'level');
      // the person who gave it has new work next time
      if (talk.npc) talk.npc.offered = null;
      hud.setPlayer(player);
      talk.update(talkContext(talk.npc));
      autoSave();
    },
  });

  // ---------------------------------------------------------------- flight and other worlds
  //
  // Space is a separate scene in compressed units (see js/space.js). Landing on a different world
  // means rebuilding everything that belongs to a planet — terrain, sky, scatter, features, weather,
  // the controller, the enemies and the map — while the character, their gear and their level carry
  // straight over.

  let space = null;
  let mode = 'ground';                 // ground | launch | space | land
  let modeT = 0;
  let landingTarget = null;

  function disposePlanet() {
    folk?.dispose();
    view.dispose(); props.dispose(); features.dispose(); weatherView.dispose();
    field.clear();
    map.dispose();
    scene.remove(sky.sunLight); scene.remove(sky.sunLight.target); scene.remove(sky.ambient);
    sky.dispose();
  }

  function makeFolk() {
    return createTownFolk(scene, terrain, {
      features, rpg, namegen, looks: npcLooks, seed, balance,
      radius: lowQuality ? 500 : (balance.town?.radius ?? 900),
    });
  }

  function makeMap() {
    return createMapScreen({
      terrain, seed,
      getPlayer: () => control,
      getEnemies: () => field.enemies,
      onTeleport: (x, z) => { control.teleport(x, z); rebuildWorldAround(true); field.clear(); },
      pins: map ? [...map.pins] : [],
    });
  }

  /** Build a world and put the player on it. `spot` is {u, v} across the map, from a landing. */
  function buildPlanet(nextPlanet, spot = null) {
    disposePlanet();

    planet = nextPlanet;
    world = generatePlanetMap(planet, mapSize);
    terrain = makeTerrain(world, planet, balance.terrain);
    palette = atmospherePalette(planet);

    sky = createSky({ star, system, planet, balance, palette });
    scene.add(sky.sunLight); scene.add(sky.sunLight.target); scene.add(sky.ambient);
    scene.fog = sky.fog;

    view = createTerrainView(scene, terrain, { rings: ringSpec, waterColor: palette.sea });
    props = createProps(scene, terrain, {
      seed,
      density: lowQuality ? 0.45 : (balance.props?.density ?? 1),
      radius: lowQuality ? 4 : (balance.props?.radius ?? 7),
      grassPerCell: lowQuality ? 60 : (balance.props?.grassPerCell ?? 150),
    });
    features = createFeatures(scene, terrain, {
      palette, seed, radius: lowQuality ? 1500 : (balance.features?.radius ?? 2600),
    });
    weatherView = createWeatherView({
      scene, skyScene: sky.scene, palette, seed, quality: lowQuality ? 'low' : 'high',
    });

    control = createController(terrain, balance, camera, { obstacles: [props.solids, features.solids] });
    field = makeField();
    folk = makeFolk();
    hud.setTerrain(terrain);
    map = makeMap();

    const start = spot
      ? { x: spot.u * terrain.widthM, z: spot.v * terrain.depthM }
      : { x: control.spawn.x, z: control.spawn.z };
    control.teleport(start.x, start.z);
    // never come down in the sea
    if (terrain.waterAt(control.x, control.z)) control.teleport(control.spawn.x, control.spawn.z);

    weather = new WeatherClock({
      weights: weatherWeights(terrain.climateAt(control.x, control.z)),
      seed,
      minMinutes: balance.weather?.minMinutes ?? 1.2,
      maxMinutes: balance.weather?.maxMinutes ?? 4,
      transitionSeconds: balance.weather?.transitionSeconds ?? 20,
    });
    blended = weather.blend();
    weatherCell = [-1, -1];

    rebuildWorldAround(true);
    if (campaign.onLandOn(planet.id)) hud.log(`${planet.name} charted.`, 'level');
    $('hud-planet').textContent = describePlanet(planet, star);
    return planet;
  }

  function ensureSpace() {
    if (!space) {
      space = createSpace({ star, system, homePlanet: planet, homeWorld: world, balance, seed });
    }
    return space;
  }

  /** Leave the ground. */
  function launch() {
    if (mode !== 'ground') return;
    ensureSpace();
    mode = 'launch';
    modeT = 0;
    hud.log('You board the ship and lift off.', 'level');
  }

  /** Put down on whatever the ship is close enough to. */
  function land() {
    if (mode !== 'space') return;
    const target = space.canLand();
    if (!target) { hud.log('Nothing close enough to land on. Fly nearer a world.', 'bad'); return; }
    landingTarget = { planet: target.planet, spot: space.landingSpot(target.body) };
    mode = 'land';
    modeT = 0;
    hud.log(`Descending to ${target.planet.name}.`, 'level');
  }

  /** Everything that happens when you are not standing on a planet. */
  function stepFlight(dt, snap) {
    modeT += dt;
    const spaceCfg = balance.space || {};

    if (mode === 'launch') {
      // climb away from the ground. The fog closes and the light drains, and at the top the space
      // scene takes over — the swap happens while there is nothing left to see of the ground.
      const k = Math.min(1, modeT / (spaceCfg.ascentSeconds ?? 3.2));
      control.y += dt * 240 * (0.3 + k * 2.4);
      camera.position.set(control.x - Math.sin(control.yaw) * 30, control.y + 16, control.z - Math.cos(control.yaw) * 30);
      camera.lookAt(control.x, control.y + 60, control.z);
      scene.fog.near = 10;
      scene.fog.far = Math.max(180, 7000 * (1 - k * 0.94));
      if (k >= 1) {
        ensureSpace().enter({ fromPlanet: planet, elapsed: state.elapsed });
        camera.far = 600000; camera.updateProjectionMatrix();
        mode = 'space';
        hud.log('W to fly · Shift to boost · hold Space to warp · J to land', 'level');
      }
      return;
    }

    if (mode === 'space') {
      space.update(dt, snap, camera);
      const r = space.readout();
      hud.tick(player, {
        place: `${star.name} system`,
        clock: `${r.target} · ${r.distanceAu.toFixed(2)} AU`,
        target: null,
        sky: r.canLand ? 'close enough to land — press J' : 'fly to a world to land on it',
        weather: `${r.mode}${r.warpCharge > 0.05 ? ` (warp ${Math.round(r.warpCharge * 100)}%)` : ''} · ${r.speed} u/s`,
        where: `seed ${seed} · in flight`,
      });
      return;
    }

    if (mode === 'land') {
      // dive at the target, then rebuild the ground under it
      const body = space.bodies.find(b => b.planet.id === landingTarget.planet.id);
      if (body) { space.aimAt(body); space.state.throttle = 1; }
      space.update(dt, { forward: 1, strafe: 0, run: true, jump: false, attack: false, look: [0, 0], pressed: new Set() }, camera);
      if (modeT >= (spaceCfg.descentSeconds ?? 2.6)) {
        camera.far = 24000; camera.updateProjectionMatrix();
        buildPlanet(landingTarget.planet, landingTarget.spot);
        landingTarget = null;
        mode = 'ground';
        hud.log(`You set down on ${planet.name}. ${describePlanet(planet, star)}`);
        autoSave();
      }
    }
  }

  /** Draw whichever world we are in. */
  function renderFrame() {
    renderer.clear();
    if (mode === 'ground' || mode === 'launch') {
      renderer.render(sky.scene, sky.camera(camera));
      renderer.clearDepth();
      renderer.render(scene, camera);
    } else {
      renderer.render(space.scene, camera);
    }
    document.body.dataset.ready = '1';
    state.ready = true;
  }

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
      quests: questLog.toJSON(),
      campaign: campaign.toJSON(),
      passiveRanks: player.passiveRanks,
      pendingPassive: player.pendingPassive,
      pendingTalent: player.pendingTalent,
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
    sound: () => { const m = sound.mute(); hud.log(m ? 'Sound off.' : 'Sound on.'); return m; },
    voice: () => { const v = speech.setVoice(!speech.voiceOn); hud.log(v ? 'Voices on.' : 'Voices off.'); return v; },
  });

  function xpToNext() {
    const next = Math.round(58 * Math.pow(player.level, 1.86));
    return Math.max(1, next - player.xp);
  }

  // ---------------------------------------------------------------- keys that are not movement
  window.addEventListener('keydown', e => {
    if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); hud.toggleSheet(); }
    if (e.code === 'KeyM') { e.preventDefault(); map.toggle(); }
    if (e.code === 'Escape') { if (talk.isOpen) talk.close(); else if (hud.sheetOpen) hud.toggleSheet(false); else if (map.isOpen) map.toggle(false); }
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
  let sinceArrive = 0;
  const lastPos = [0, 0];
  let campaignDone = false;
  let lastEclipse = null;

  function tick() {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, clock.getDelta());
    if (state.paused) return;
    state.elapsed += dt;
    state.playtime += dt;
    state.frames++;

    const snap = input.sample();

    // J is the ship: board it on the ground, put it down in space
    if (snap.pressed?.has('KeyJ')) {
      if (mode === 'ground') launch();
      else if (mode === 'space') land();
    }
    if (mode !== 'ground') { stepFlight(dt, snap); renderFrame(); return; }

    // E speaks to whoever is standing in front of you
    if (snap.pressed?.has('KeyE')) {
      if (talk.isOpen) talk.close();
      else {
        const who = folk.nearest(control.x, control.z);
        if (who) {
          // phase 7: what they say comes from Lingo and their own personality, not a fixed string
          speech.attach(who);
          who.greeting = speech.line(who, 'greet', { listener: { name: player.name } });
          sound.ui('open');
          talk.show(who, talkContext(who));
          speech.say(who, who.greeting);
        } else hud.log('Nobody close enough to talk to.');
      }
    }

    const frozen = hud.sheetOpen || debug.isOpen || map.isOpen || talk.isOpen;
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
        // A bow aims where you are LOOKING — the same ray the camera runs down — so you can shoot
        // up a slope or down off a ledge. Using only the horizontal facing meant every arrow flew
        // flat no matter where the crosshair was.
        const cp = Math.cos(control.pitch);
        const ax = Math.sin(control.yaw) * cp;
        const ay = Math.sin(control.pitch);
        const az = Math.cos(control.yaw) * cp;
        const eyeY = control.y + 1.45;
        const range = balance.player?.arrowRange ?? 46;
        const arrow = fx.shoot({
          x: control.x + ax * 0.7, y: eyeY + ay * 0.5, z: control.z + az * 0.7,
          dirX: ax, dirY: ay, dirZ: az,
          range, speed: balance.player?.arrowSpeed ?? 42,
        });
        // if something is directly in the shot, it stops there
        sound.combat('bow');
        const target = field.hitScan(control.x, eyeY, control.z, ax, ay, az, { range });
        if (target && arrow) arrow.range = Math.min(arrow.range, target.distance);
      } else {
        // a swing: the white arc IS the hit box — same reach, same angle
        fx.swipe({ x: control.x, y: control.y, z: control.z, yaw: control.yaw, reach, arc });
        const hits = field.strike(control, player, { reach, arc });
        sound.combat(hits.length ? 'hit' : 'swing', { crit: hits.some(h => h.result.crit) });
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
        if (result.reflected) hud.log(`Thorns bite back for ${result.reflected}.`, 'good');
        if (player.hp <= 0) respawn(e);
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
    folk.update(dt, control);
    sound.step(dt, control);
    // the survey counts the ground you actually cover
    const stepped = Math.hypot(control.x - lastPos[0], control.z - lastPos[1]);
    if (stepped > 0 && stepped < 200) campaign.onWalk(stepped);
    lastPos[0] = control.x; lastPos[1] = control.z;

    sinceArrive += dt;
    if (sinceArrive > 1) {
      sinceArrive = 0;
      for (const q of questLog.onArrive({ x: control.x, z: control.z })) {
        hud.log(`${q.title}: arrived.`, 'good');
      }
    }

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
    if (town && campaign.onEnterSettlement(town.id)) hud.log(`${town.name} charted.`, 'level');
    if (!campaignDone && campaign.complete) {
      campaignDone = true;
      hud.log(`${campaignData.title} complete. The ledger is closed.`, 'level');
      sound.questDone();
      autoSave();
    }
    if (state.frames % 45 === 0) {
      sound.place(terrain.biomeAt(control.x, control.z).key, { inTown: !!town, storm: blended.wind });
    }
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

    renderFrame();
  }

  function respawn(killer = null) {
    hud.log('You black out, and wake where you landed.', 'bad');
    player.deaths++;
    if (killer) {
      const named = campaign.onDeath({
        defId: killer.defId,
        name: namegen ? (namegen.generate('person.full', { race: 'orc', seed: (killer.defId || '').length * 7919 + player.deaths })?.text || killer.name) : killer.name,
        level: killer.level,
      });
      if (named) hud.log(`${named.name} ${named.title} left you for dead. It will be back.`, 'bad');
    }
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
    world, star, system, saves, horse,
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
    get mode() { return mode; },
    get space() { return space; },
    get planet() { return planet; },
    get palette() { return palette; },
    get terrain() { return terrain; },
    launch, land,
    get folk() { return folk; },
    questLog, talk, sound, speech, campaign,
    /** Skip the cinematics — go straight to space, or straight down onto a world. */
    toSpace: () => { ensureSpace().enter({ fromPlanet: planet, elapsed: state.elapsed }); camera.far = 600000; camera.updateProjectionMatrix(); mode = 'space'; },
    landOn: (planetId, spot = null) => {
      const p = system.planets.find(p => p.id === planetId) || planet;
      camera.far = 24000; camera.updateProjectionMatrix();
      buildPlanet(p, spot);
      mode = 'ground';
      return planet.name;
    },
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
