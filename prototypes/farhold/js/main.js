// Farhold — phase 3. Boot the planet, build the scene, run the loop.
//
// Everything the game does is in the modules next door; this file wires them together and owns the
// frame loop. `window.farhold` is the handle the Playwright specs drive.

import * as THREE from 'three';
import { createWorld, makeTerrain, describePlanet, createSystem, chooseLanding, isHabitableStart, landableBodies, M_PER_CELL, setMetresPerCell, M_PER_CELL_DEFAULT } from './planet.js';
import { createSpace } from './space.js';
import { createShip } from '../../../assets/js/space-models.js';
import { createAtmosphere } from './atmos.js';
import { createTownFolk } from './town.js';
import { createTalkPanel } from './talkui.js';
import { QuestLog, gatherable, submitGather } from './quests.js';
import { Campaign } from './campaign.js';
import { createSound } from './sound.js';
import { createSpeech } from './speech.js';
import { createSettings } from './settings.js';
import { NameGen } from '../../../namegen/js/namegen.js';
import { generatePlanetMap } from '../../../universe/js/planetmap.js';
import { BIOMES } from '../../../worldgen/js/biomes.js';
import { createTerrainView } from './terrain.js';
import { createSky } from './sky.js';
import { createProps } from './props.js';
import { createFeatures } from './features.js';
import { createWeatherView } from './weather.js';
import { createCombatFx } from './combat-fx.js';
import { createSunFx } from './sunfx.js';
import { createDebugMenu } from './debug.js';
import { createMapScreen } from './map.js';
import { MarkerBook, distanceText } from './markers.js';
import { createStarChart, reachFrom, LY_PER_UNIT } from './starchart.js';
import { createWarp } from './warp.js';
import { generateGalaxy } from '../../../universe/js/galaxy.js';
import { createSaves, snapshot, restore, playtimeText, saveCarriesWorld } from './save.js';
import { pointsFor } from './perks.js';
// ---- The Territory expansion (see EXPANSION.md): who holds the ground, and what it asks of you
import { createStandings, ranked as rankedFactions, createIntroducer } from './factions.js';
import { createTerritory } from './territory.js';
import { createJobGen, candidatesFrom } from './jobgen.js';
import { createIncidents, NO_EFFECT } from './incidents.js';
import { createPatrols } from './patrols.js';
import { createCaravans } from './caravans.js';
import { createWanderers } from './wanderers.js';
import { createRumours } from './rumours.js';
import { createWaypoints, boardSpotFor } from './waypoints.js';
// The building expansion: BUILDING_EXPANSION.md. Industry, ground, colony, and the way off the rock.
import { createStoreNetwork } from './stores.js';
import { createGrid } from './power.js';
import { createWorks } from './refine.js';
import { createNodeWorld } from './resources.js';
import { createMining } from './mining.js';
import { createOreView } from './ore-view.js';
import { createDefence } from './defence.js';
import { helpersNear, helperKey } from './questhelp.js';
import {
  GROUND_VEHICLES, LADDER as GROUND_LADDER, driveFor, selectVehicle as selectGroundVehicle,
  canBuild as canBuildVehicle,
  buildVehicle, refuel as refuelVehicle, repair as repairVehicle, speedOn, drive as driveVehicle,
  rangeLeft, modelFor, describeVehicle, GROUND_FUEL,
} from './vehicles.js';
import { createGroundVehicle } from '../../../avatar-3d/js/ground-vehicles.js';
import { createTerraform } from './terraform.js';
import { createPortals } from './portal.js';
import { createBuild } from './build.js';
import { createBuildUI } from './build-ui.js';
import { createHomes } from './homes.js';
import { WorkBoard } from './work.js';
import { createColony } from './colony.js';
import { createFarm } from './farm.js';
import {
  migrateSave as migrateShipyard, canLaunch as canLaunchShip, spendFlightFuel, grantShip,
  yard as shipYard, PART_IDS, SUBSYSTEMS, SHIPS, PAD, FUEL,
  canBuildPart, buildPart, buildPad as buildLaunchPad, assembleShip, shipReady, refuel, partCost,
} from './shipyard.js';
import { createInput, createController, KEY_HELP } from './player.js';
import { EnemyField, makeActor, setActorAnim } from './actors.js';
import { Rpg, heldLookFor, offhandLookFor, describeAffix, attuneWeapon, elementOf, statusOf, CAST_ELEMENTS, bandForPlanet, PLANET_BANDS, itemScore, displayName } from './rpg.js';
import { Hud, SLOT_LABELS } from './hud.js';
import { createSkillBar, applyStatus, tickStatuses, slowOf, buffsOf, outgoingFrom, incomingFrom } from './skills.js';
// round 4: the RPG expansion
import { buildZones } from './zones.js';
import { createChests } from './chests.js';
import { createMeteors } from './meteors.js';
import { createDungeon, createGates, lookForBiome } from './dungeon.js';
import { createPets, CLASS_PETS } from './pets.js';
import { createSites } from './sites.js';
import { createEncounters } from './encounters.js';
import { createLight, STARTER_TORCH, STARTER_MOUNT } from './light.js';
import { unlockVehicle, selectVehicle, startingVehicles, vehicleFor, VEHICLES, mountLook } from './gear.js';
import { createBoat } from './boat.js';
import { handsOf, strikeAt, withArea, profileOf, isStaff, isWand, staffSpell, wandBehaviour, OFFHAND_DAMAGE } from './weapons.js';
import { talentPlan, pickTalent, clearTalent, talentsOn } from './skilltalents.js';
import { allocate as allocatePerk, refundAll as refundPerks, refundOne as refundOnePerk, pointsLeft as perkPointsLeft } from './perks.js';
import { createCrafting, Materials } from './craft.js';
import { showRewards, rewardsOpen } from '../../../shared/rewards.js';
import { familiesOf } from '../../../worldgen/js/biomes.js';
import { SpellFx } from '../../../avatar-3d/js/spellfx.js';
import { Assets } from '../../../assets/js/assets.js';
import { atmospherePalette, weatherWeights, weatherOdds, WeatherClock, WEATHER_BY_KEY } from '../../../worldgen/js/weather.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);

/**
 * The ship's speed, in something a person can plan a flight with.
 *
 * It used to print `state.speed` straight out as "0 u/s" — scene units a second, which is an engine
 * number and means nothing on screen. The distance beside it is already in AU, so the speed is too:
 * full cruise is about 0.7 AU a minute, boost a little over two, and a world three AU out is then
 * plainly a four-minute flight.
 */
function speedText(unitsPerSecond, auInUnits) {
  return `${(unitsPerSecond / (auInUnits || 1) * 60).toFixed(2)} AU/min`;
}

// Round 4: every class in `data/classes.json` is playable — all thirty. What each one starts
// holding lives there too, so the old eight-entry starter-weapon table is gone.

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

  const [items, balance, bestiary, talents, campaignData, classLooks, skillData, classData, craftData, encounterData, namegen,
    factionData, frameData, incidentData, wandererData, landmarkData, rewardData,
    resourceData, refiningData, powerData, structureData, colonyData, cropData, raidData] = await Promise.all([
    loadJSON('../emberveil/data/items.json'),
    loadJSON('data/balance.json'),
    loadJSON('data/enemies.json'),
    loadJSON('data/talents.json'),
    loadJSON('data/campaign.json'),
    loadJSON('../emberveil/data/class-looks.json'),
    loadJSON('data/skills.json'),
    loadJSON('data/classes.json'),
    loadJSON('data/crafting.json'),
    loadJSON('data/encounters.json'),
    // Name Forge, so the folk in a dwarf town have dwarf names
    NameGen.load('/namegen/data/').catch(() => null),
    // The Territory expansion
    loadJSON('data/factions.json'),
    loadJSON('data/job-frames.json'),
    loadJSON('data/incidents.json'),
    loadJSON('data/wanderers.json'),
    loadJSON('data/landmarks.json'),
    loadJSON('data/faction-rewards.json'),
    // the building expansion's own data
    loadJSON('data/resources.json').catch(() => null),
    loadJSON('data/refining.json').catch(() => null),
    loadJSON('data/power.json').catch(() => null),
    loadJSON('data/structures.json').catch(() => null),
    loadJSON('data/colony.json').catch(() => null),
    loadJSON('data/crops.json').catch(() => null),
    loadJSON('data/raids.json').catch(() => null),
  ]);

  // all thirty classes now, each labelled with what it does and whether it brings companions
  const classes = classData.classes;
  const classIds = classes.map(c => c.id);
  const select = $('boot-class');
  select.replaceChildren(...classes.map(c => {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = `${c.name} — ${c.role}${c.pet ? ' (companions)' : ''}`;
    return o;
  }));
  // ?class=mage picks one without touching the menu — handy for a test, and for trying a class out
  select.value = classIds.includes(params.get('class')) ? params.get('class') : 'ranger';

  /**
   * WHAT THE CLASS YOU ARE ABOUT TO PLAY ACTUALLY IS.
   *
   * Thirty entries in a dropdown, each one a name and two words of role, and the choice is locked in
   * for the whole run. Everything needed to answer "what does this one do" was already loaded —
   * `data/skills.json` has a one-line description of every skill, `data/classes.json` has the
   * weapon it starts holding and what it is allowed to hold, and `pets.js` knows which classes bring
   * a companion — so none of it had to be written twice. The Skills tab renders the same three
   * facts once the run has started, which was far too late to be useful.
   */
  function drawClassCard() {
    const box = $('boot-class-card');
    if (!box) return;
    const c = classes.find(x => x.id === select.value);
    if (!c) { box.replaceChildren(); return; }
    const unlock = skillData.unlockAt || [1];
    const kit = [];
    const starter = items.weaponBases?.[c.starter];
    if (starter) kit.push(`starts with a ${starter.name.toLowerCase()}`);
    if (c.weapons?.length) kit.push(`can hold ${c.weapons.join(', ')}`);
    if (c.armorTier) kit.push(`${c.armorTier} armour`);
    if (c.shield) kit.push('a shield');
    if (c.primaryAttr) kit.push(c.primaryAttr);
    // the companion is on the class if it has been overridden there, and in pets.js otherwise
    const pet = c.pet || CLASS_PETS[c.id];
    const petDef = pet && (bestiary.pets || []).find(x => x.id === pet.id);
    const rows = (c.skills || []).map((id, i) => {
      const sk = skillData.skills?.[id];
      if (!sk) return '';
      const at = unlock[i] ?? unlock[unlock.length - 1];
      return `<li><b>${sk.name}</b><span>${sk.desc || ''}</span>`
        + `<i>${at > 1 ? `level ${at}` : 'from the start'}</i></li>`;
    }).join('');
    box.innerHTML = `<h4>${c.name} <span>${c.role}</span></h4>`
      + `<p class="cc-kit">${kit.join(' · ')}</p>`
      + `<ul class="cc-skills">${rows}</ul>`
      + (petDef ? `<p class="cc-pet">Brings a companion: ${petDef.name}`
        + `${pet.count > 1 ? ` ×${pet.count}` : ''}`
        + `${pet.extra ? `, and ${(bestiary.pets.find(x => x.id === pet.extra.id) || {}).name || 'another'}` : ''}.</p>` : '');
  }
  select.onchange = drawClassCard;
  drawClassCard();
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
      load.onclick = () => begin({ items, balance, bestiary, talents, campaignData, classLooks, skillData, classData, craftData, encounterData, namegen, factionData, frameData, incidentData, wandererData, landmarkData, rewardData, resourceData, refiningData, powerData, structureData, colonyData, cropData, raidData, status, save: saves.read(s.id) });
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
      cont.onclick = () => begin({ items, balance, bestiary, talents, campaignData, classLooks, skillData, classData, craftData, encounterData, namegen, factionData, frameData, incidentData, wandererData, landmarkData, rewardData, resourceData, refiningData, powerData, structureData, colonyData, cropData, raidData, status, save: saves.read(last) });
    }
  }
  drawSaves();
  status('');

  $('boot-start').onclick = () => {
    $('boot-start').disabled = true;
    begin({ items, balance, bestiary, talents, campaignData, classLooks, skillData, classData, craftData, encounterData, namegen, factionData, frameData, incidentData, wandererData, landmarkData, rewardData, resourceData, refiningData, powerData, structureData, colonyData, cropData, raidData, status, save: null }).catch(err => {
      status('failed: ' + err.message);
      $('boot-start').disabled = false;
      console.error(err);
    });
  };

  /**
   * `?load=<id>` — or `?load=last` — starts straight into a save.
   *
   * There was no way to continue a save without a human clicking a row, which meant no test could
   * ever prove that anything survives a reload: it could only check that `snapshot()` had the right
   * fields on it, which is exactly the check that passed every time `world`, `quests` and
   * `campaign` were being dropped on the floor. Now a test does what a player does.
   */
  const wanted = params.get('load');
  if (wanted) {
    const chosen = wanted === 'last' ? saves.lastId() : wanted;
    const data = chosen ? saves.read(chosen) : null;
    if (data) {
      begin({ items, balance, bestiary, talents, campaignData, classLooks, skillData, classData, craftData, encounterData, namegen, factionData, frameData, incidentData, wandererData, landmarkData, rewardData, resourceData, refiningData, powerData, structureData, colonyData, cropData, raidData, status, save: data })
        .catch(err => { status('failed: ' + err.message); console.error(err); });
      return;
    }
    status(`no save called ${wanted}`);
  }

  if (params.has('auto')) $('boot-start').click();
}

async function begin({ items, balance, bestiary, talents, campaignData, classLooks, skillData, classData, craftData, encounterData, namegen, factionData, frameData, incidentData, wandererData, landmarkData, rewardData, resourceData, refiningData, powerData, structureData, colonyData, cropData, raidData, status, save }) {
  const seed = save ? save.seed : (Number($('boot-seed').value) || 1);
  const classId = save ? save.classId : $('boot-class').value;
  const lowQuality = params.get('quality') === 'low';

  /**
   * The world knobs from the title screen, remembered in the save so a loaded run rebuilds the same
   * world. `regionScale` is the one that matters most: World Forge's own regions are enormous, and
   * a region is a level band — "it would take a long time to get to the next zone" was the note.
   */
  const worldOpts = save?.world || {
    regionScale: Number(params.get('regions')) || Number($('boot-regions')?.value) || 2,
    bandWidth: Number(params.get('band')) || Number($('boot-band')?.value) || 4,
    density: Number(params.get('density')) || Number($('boot-density')?.value) || 1,
    planetScale: Number(params.get('scale')) || Number($('boot-scale')?.value) || 1,
    // On by default: a first hour on a locked-biome rock with nobody on it is a poor first hour.
    habitable: params.has('habitable')
      ? params.get('habitable') !== '0'
      : ($('boot-habitable')?.checked ?? true),
  };
  // How big a planet feels underfoot. 640 m a cell gives 163 x 82 km, which is a lot of ground on
  // foot; the default is smaller now, and it is a knob because the full size is the right size once
  // you are riding. It has to be set BEFORE the world is built — every module reads the live binding.
  setMetresPerCell(M_PER_CELL_DEFAULT * (worldOpts.planetScale ?? 1));
  // the enemy-density knob multiplies how many are alive and how often one arrives
  const spawnCfg = {
    ...balance.spawn,
    maxAlive: Math.round((balance.spawn?.maxAlive ?? 38) * worldOpts.density),
    everySeconds: (balance.spawn?.everySeconds ?? 1.1) / Math.max(0.3, worldOpts.density),
  };
  balance = { ...balance, spawn: spawnCfg, zones: { ...balance.zones, bandWidth: worldOpts.bandWidth } };

  status('shaping the planet…');
  await frame();
  const mapSize = { width: balance.world?.width ?? 256, height: balance.world?.height ?? 128, regionScale: worldOpts.regionScale };
  /**
   * WHERE THE RUN IS, NOT JUST WHICH SEED IT STARTED FROM.
   *
   * A save used to carry the run seed and nothing else, so loading always rebuilt the *starting*
   * system — travel several stars out, save, reload, and you woke up in the ocean of the world you
   * had left hours ago. The save now also carries the system seed and the planet, and a load builds
   * that system directly.
   */
  const at = save?.at || null;
  const created = at?.systemSeed
    ? (() => {
      const built = createSystem({ seed: at.systemSeed });
      const landing = built.system.planets.find(p => p.id === at.planetId)
        || built.system.planets.flatMap(p => p.moons || []).find(m => m.id === at.planetId)
        || chooseLanding(built.system);
      return {
        star: built.star, system: built.system, planet: landing,
        world: generatePlanetMap(landing, mapSize),
        systemSeed: at.systemSeed, movedSeed: false,
      };
    })()
    // `liveable: true` whether or not the box is ticked — the box decides where you LAND, and the
    // starting system always has somewhere you could breathe (see createWorld)
    : createWorld({ seed, ...mapSize, habitable: worldOpts.habitable, liveable: true });
  // the search may have stepped to a neighbouring seed; everything downstream uses the one it found
  let systemSeed = created.systemSeed ?? seed;   // `let`: a jump replaces the whole system
  let { star, system } = created;   // `let`: a jump to another star replaces both

  /**
   * THE GALAXY THIS RUN LIVES IN.
   *
   * Star Forge grows a disc of stars with travel lanes between them; every one of them carries its
   * own seed, and a seed is all `createSystem` needs. So a star on the chart IS a system — jumping
   * there means building that seed's system and dropping the ship into it.
   *
   * The one join is the star you start at. The habitable search picked a seed, not a position in a
   * galaxy, so the first star on the chart is rewritten to be that system: same seed, same name,
   * same class. Everything else in the disc is untouched, which keeps the lanes and the layout the
   * generator produced.
   */
  const galaxy = generateGalaxy({ seed, stars: 180, layout: 'spiral' });
  // …and only when we are actually AT the first star. Loading a save taken several jumps out
  // restores that star instead, and rewriting star 0 with its seed would have made two different
  // stars claim to be the same system.
  if (!Number.isFinite(at?.starId) || at.starId === 0) {
    const home = galaxy.stars[0];
    home.seed = systemSeed;
    home.name = star.name;
    home.classKey = star.classKey;
    home.className = star.className;
    home.color = star.color;
    home.habitable = star.habitable;
  }
  // a load puts you back at the star you were at, not at the one the run began from
  let starId = Number.isFinite(at?.starId) ? at.starId : 0;
  const starNow = () => galaxy.stars[starId] || galaxy.stars[0];
  // these are replaced wholesale when you land on a different world
  let planet = created.planet, world = created.world;
  let terrain = makeTerrain(world, planet, balance.terrain);
  /**
   * THE GROUND THE PLAYER HAS RESHAPED.
   *
   * `terraform` holds the brushes — a level here, a road strip there — and `wrap` puts them in front
   * of the world's own height so everything downstream (collision, the camera, the clipmap, props)
   * asks one question and gets the edited answer. It has to be built BEFORE `createTerrainView`,
   * because the clipmap samples the terrain it is handed at construction.
   */
  let terraform = createTerraform({ saved: save?.terraform || null });
  terrain = terraform.wrap(terrain);
  let palette = atmospherePalette(planet);
  // Round 4: how hard a fight is belongs to the PLACE. World Forge already grows named regions with
  // borders it draws on the map, so those are the level bands — see js/zones.js.
  /**
   * A WORLD'S OWN DIFFICULTY BAND.
   *
   * "Let's categorize planets by difficulty and have low (1-30), medium (30-40), and high (40-50)
   * difficulty." The band is a level range; the region graph then lays its own ladder INSIDE it, so
   * the softest corner of a far-reach world is still level 30 and its worst is 40.
   */
  let band = bandForPlanet(planet);
  let zones = buildZones(world, {
    spawn: [terrain.spawnPoint().x, terrain.spawnPoint().z],
    maxLevel: band.max, bandWidth: balance.zones?.bandWidth ?? 4, startLevel: band.min,
  });

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

  // Round 4: torches, braziers, sconces and a floor under the night ambient.
  const light = createLight(scene, { balance });

  const ringSpec = lowQuality ? balance.terrain?.ringsLow : balance.terrain?.rings;

  /**
   * How far the ground is drawn, as the player asked for it.
   *
   * One function, so the ground view and the flight stretch cannot disagree. The old `viewDistance`
   * setting was three words that nothing read; this is a multiplier on the clipmap's view scale,
   * and everything that stretches the view multiplies through it.
   */
  let viewWanted = 1;
  const viewMul = () => viewWanted;
  let view = createTerrainView(scene, terrain, {
    // the terrain knobs are a knob file like everything else; without this `maxSkirtScale` and
    // friends were code defaults nobody could tune
    ...(balance.terrain || {}), rings: ringSpec, waterColor: palette.sea });

  status('planting the world…');
  await frame();
  let props = createProps(scene, terrain, {
    seed,
    density: lowQuality ? 0.45 : (balance.props?.density ?? 1),
    radius: lowQuality ? 4 : (balance.props?.radius ?? 7),
    grassPerCell: lowQuality ? 60 : (balance.props?.grassPerCell ?? 150),
  });
  let features = createFeatures(scene, terrain, {
    // the pad is dark until the town has been entered; `waypoints` is built just below, so this is
    // read through a function rather than captured
    waypointLit: id => waypoints?.isLit?.(id),
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

  /**
   * ================================================================ THE TERRITORY
   *
   * See EXPANSION.md. Farhold is a whole planet and crossing one is slow on purpose, so the content
   * has to be where you are standing. These seven modules turn a zone from "a name and a level band"
   * into a place that is HELD by somebody, has real camps and roads and people on them, and asks you
   * for things that are actually there.
   *
   * All seven are pure — no Three.js, no DOM — and they are ticked from the game loop rather than
   * simulating on their own, so a distant patrol costs one line of arithmetic a frame.
   */
  const standings = createStandings(factionData, save?.standings || null);
  // say a faction's full name the first time it comes up, and the short one after that
  const intro = createIntroducer(factionData);
  // `holdings` rather than `land`, because `land()` is already the verb for putting the ship down
  const holdings = createTerritory({
    zones, seed, factions: factionData, standings, landmarks: landmarkData,
    metresPerCell: terrain.metresPerCell, saved: save?.territory || null,
    // so a wayshrine stands on a real landmark node rather than in the middle of a field
    nodesFor: zone => (world.nodes || []).filter(n =>
      zones.at(n.x * terrain.metresPerCell, n.y * terrain.metresPerCell)?.id === zone.id),
  });
  const trouble = createIncidents({ data: incidentData, territory: holdings, factions: factionData, seed });
  const patrols = createPatrols({ territory: holdings, factions: factionData, standings, seed });
  const trade = createCaravans({ territory: holdings, factions: factionData, standings, seed });
  const roadFolk = createWanderers({ data: wandererData, territory: holdings, standings, seed });
  const rumours = createRumours({ territory: holdings, factions: factionData, seed });
  if (save?.rumours) rumours.load(save.rumours);

  /**
   * The waypoint network.
   *
   * Built from whatever settlements this world has, and re-pointed at the new list when you land
   * somewhere else — the pads are per world, like the map's learned region names, because a pad on
   * another planet is not somewhere you can walk to.
   */
  /**
   * EVERY BASE YOU EVER RAISED, WHEREVER IT IS.
   *
   * "It should be easy to teleport back to your bases even if you go to a different star system."
   * The waypoint network below is per world and gets thrown away every time you land somewhere
   * else; this does not. It is the one register that outlives a planet, so a base you built four
   * hundred light years ago is still on the list — and `routeTo` says how many legs the trip home
   * takes rather than refusing.
   */
  const homes = createHomes(save?.homes || null);
  /** Which world we are standing on, in the two numbers the register files a base under. */
  const worldKey = () => ({ systemSeed, planetId: planet?.id ?? null });

  let waypoints = createWaypoints({
    settlements: features.settlements, seed,
    built: homes.forWorld(worldKey()),
    // the same test js/features.js uses to site the pad, so the two cannot disagree
    groundOk: (x, z) => !terrain.waterAt(x, z) && !terrain.underwater(x, z)
      && terrain.riverAt(x, z) <= 0.3 && terrain.slopeAt(x, z, 4) <= 0.5,
  });
  if (save?.waypoints) waypoints.load(save.waypoints);
  const jobs = createJobGen({ frames: frameData, territory: holdings, factions: factionData, standings, seed });
  /** The board for the zone you are in. Rebuilt when you cross a border, not every frame. */
  let localBoard = [];
  let boardZone = null;

  // the folk who live in the settlements, and the work they hand out
  const questLog = save?.quests ? QuestLog.fromJSON(save.quests) : new QuestLog();
  /**
   * Everything the player is keeping an eye on: quest destinations, story objectives and the pins
   * they dropped themselves. It carries the world each one is on, so flying somewhere else no
   * longer leaves the old planet's pins scattered over the new one's map.
   */
  const markers = new MarkerBook(save?.markers || null);
  markers.setWorld({
    systemSeed, planetId: planet.id,
    planetName: planet.name, starName: star.name,
  });
  markers.syncQuests(questLog.active);
  const campaign = new Campaign(campaignData, save?.campaign || null);
  // cut the survey to what this system can actually offer
  {
    const solid = system.planets.filter(p => !p.giant && p.landable !== false);
    const townCount = (world.nodes || []).filter(n => n.type === 'settlement' || n.type === 'port').length;
    campaign.fit({
      settlements: townCount ? Infinity : 0,
      planets: solid.length,
      dungeons: (world.nodes || []).filter(n => n.type === 'dungeon').length,
    });
  }
  const npcLooks = ['ranger', 'cleric', 'rogue', 'warrior', 'bard', 'mage']
    .map(id => classLooks.classes[id]?.avatar).filter(Boolean);
  let folk = null;

  // ---------------------------------------------------------------- the player
  status('waking the wayfarer…');
  await frame();

  const rpg = new Rpg(items, { ...balance, seed }, talents);
  const classDef = classData.classes.find(c => c.id === classId) || classData.classes[0];
  const look = classLooks.classes[classId];
  const playerName = save?.name || ($('boot-name').value || '').trim() || look?.name?.split(' ')[0] || 'Wayfarer';
  const player = rpg.createPlayer({ name: playerName, classId, avatar: look?.avatar || null });
  player.barrier = 0;
  // the pretty name, for the sheet header — `classId` is the raw id ("stormcaller")
  player.classLabel = classDef.name || classId;

  // the materials bag: separate from the item bag, and it never fills
  const materials = Materials.from(save?.materials || {});
  const craft = createCrafting({ data: craftData, rpg, materials, rng: rpg.rng });

  if (!save) {
    // attuned like every other weapon, or a level-1 character's first sword has no facts on its
    // card until the day it is replaced
    const starter = attuneWeapon(rpg.loot.generate(classDef.starter || 'sword', 'normal', 'low', { rng: rpg.rng }));
    if (starter) rpg.equip(player, starter, { force: true });
    for (const key of classDef.startingArmour || []) {
      const piece = attuneWeapon(rpg.loot.generate(key, 'normal', 'low', { rng: rpg.rng }));
      if (piece) rpg.equip(player, piece, { force: true });
    }
    // EVERY character starts with a torch and a horse — both in slots of their own, so a torch does
    // not cost you your shield and a mount is a thing you own rather than a key you press.
    rpg.equip(player, JSON.parse(JSON.stringify(STARTER_TORCH)), { force: true });
    rpg.equip(player, JSON.parse(JSON.stringify(STARTER_MOUNT)), { force: true });
  }

  // only the player swims, so only the player pays for the swim clips
  const actor = await makeActor({ avatar: JSON.parse(JSON.stringify(look?.avatar || {})), swim: true });
  scene.add(actor.group);

  // ---------------------------------------------------------------- first person (V)
  //
  // A skinned mesh draws from the mesh, not the bone tree, so hiding the head bone does nothing —
  // the vertices are still there. Collapsing it to nothing does work: everything weighted to the
  // head (and to the eyes, which hang off it) folds into a point inside the neck. The camera then
  // sits on the eye bone itself, so the view is where the model's eyes actually are.
  const eyeWorld = new THREE.Vector3(), eyeRight = new THREE.Vector3();
  let headScale = null;
  function setFirstPerson(on) {
    const head = actor.parts?.head;
    if (!head) return false;
    if (headScale === null) {
      headScale = head.scale.clone();
      // how high this particular body's eyes sit above its feet, taken from the bones themselves
      actor.group.updateMatrixWorld(true);
      eyeWorld.setFromMatrixPosition(actor.parts.eyeL.matrixWorld);
      eyeRight.setFromMatrixPosition(actor.parts.eyeR.matrixWorld);
      eyeWorld.lerp(eyeRight, 0.5);
      control.eyeHeight = Math.max(0.6, eyeWorld.y - actor.group.position.y);
    }
    control.firstPerson = !!on;
    if (on) head.scale.setScalar(0.0001);
    else head.scale.copy(headScale);
    hud.log(on ? 'First person. V to come back out.' : 'Back over your shoulder.');
    return control.firstPerson;
  }

  /**
   * The mount you bought is the mount you ride.
   *
   * E3: "I bought a moor pony, which seemed to be identical to Trail Horse I started with." It was —
   * one hard-coded brown horse was built at boot and shown for every mount in the game, so the shop
   * sold three animals and the world had one. `mountLook` (js/gear.js) gives each base its own body,
   * and the model is rebuilt whenever the mount slot changes rather than once at boot.
   */
  let horse = null;
  let horseKey = null;
  /**
   * The motorcycle, the car and the truck — built once and hidden, like the horse and the boat.
   *
   * "I definitely want the ability to craft a motorcycle and a car and eventually a truck."
   * avatar-3d/js/ground-vehicles.js holds all three bodies; js/vehicles.js holds what they cost,
   * how fast they are on which ground, and how much fuel they drink. Neither was imported.
   */
  const rig = createGroundVehicle();
  scene.add(rig.group);
  /** Did the ground vehicle hide the walking body? Only it may put it back. */
  let hidForRig = false;
  async function buildMount() {
    const item = player.equipment?.mount || null;
    const key = item?.baseKey || 'trail_horse';
    if (horse && key === horseKey) return;
    try {
      const made = await makeActor(mountLook(item));
      if (horse) { scene.remove(horse.group); horse.dispose?.(); }
      horse = made;
      horseKey = key;
      horse.group.visible = false;
      scene.add(horse.group);
    } catch { /* keep whatever we had rather than leaving the player on foot */ }
  }
  await buildMount();

  /**
   * The boat, built once beside the horse and hidden until you are in deep water.
   *
   * Same reasoning as the horse above: a boat is put away far more often than it is used, and
   * building geometry the moment somebody wades into a river is a hitch you only ever notice on the
   * water. All three hulls live inside the one group; `show()` picks between them.
   */
  const boat = createBoat();
  scene.add(boat.group);

  // Settings are built before the controller, because the camera reads the shoulder side, the
  // inverted look and the sensitivity on every frame. `control` is declared first and left null:
  // createSettings applies what it remembered straight away, and reaching a `let` before its
  // declaration is a ReferenceError, not undefined.
  let control = null;
  // declared here, built further down: `createSettings` applies the stored values immediately and
  // reads this, and reading a `const` before its line throws rather than coming back undefined
  let sunfx = null;
  const settings = createSettings({
    apply: (v, key) => {
      if (!key || key === 'sound') sound.mute(!v.sound);
      if (!key || key === 'voices') speech.setVoice(v.voices);
      if ((!key || key === 'density' || key === 'grass') && props && control) {
        props.setDensity(v.density, control.x, control.z);
        props.setGrass(v.grass, control.x, control.z);
      }
      if (!key || key === 'viewDistance') {
        // read off the values `apply` was handed, NOT off `settings` — this callback runs while
        // createSettings is still constructing, so the binding does not exist yet
        viewWanted = Math.max(0.5, Number(v.viewDistance) || 1);
        if (view && control) {
          view.setViewScale(viewWanted, control.x, control.z);
          view.update(control.x, control.z, true);
        }
      }
      if ((!key || key === 'sunfx') && sunfx) sunfx.setEnabled(v.sunfx);
      // D15: the field of view. settings.js used to reach for `window.farhold.camera` on a timer,
      // because the agent that added it could not edit this file — it has the camera handed to it.
      if ((!key || key === 'fov') && camera?.isPerspectiveCamera && camera.fov !== v.fov) {
        camera.fov = v.fov;
        camera.updateProjectionMatrix();
      }
    },
  });

  control = createController(terrain, balance, camera, {
    obstacles: [props.solids, features.solids], settings,
    // which boat goes under you when you start swimming — read live, so buying one mid-run counts
    boat: () => vehicleFor(player, 'boat'),
    // …and everything the player is wearing, riding and has spent a perk on. Without this the legs
    // ran on the flat numbers out of balance.json and every move-speed perk was inert.
    derived: () => player.derived,
  });
  const input = createInput(renderer.domElement);

  /** Clicks taken while build mode is up, drained by the frame loop. Filled just after `build`. */
  let buildClicks = 0;
  const fx = createCombatFx(scene, {
    // `terrain` is replaced when you land on a new world, so read it through the binding
    groundAt: (x, z) => terrain.heightAt(x, z),
    onArrowLand: arrow => {
      const splash = balance.player?.arrowSplash ?? 2.6;
      const bow = player.equipment.weapon;
      const element = elementOf(bow);
      const leaves = statusOf(bow);
      const hits = field.strikeArea(arrow.x, arrow.z, splash, player, { element });
      sound.combat('arrow');
      for (const { enemy, result } of hits) {
        if (leaves && skillData.statuses[leaves] && result.amount > 0) {
          landStatus(leaves, skillData.statuses[leaves], enemy, Math.max(1, result.amount * 0.7));
        }
        reportHit(enemy, result);
      }
    },
  });

  // ---------------------------------------------------------------- skills (phase 3)
  //
  // Four of them, on 1-4. The spell effects are avatar-3d's `SpellFx`, the same module both other
  // prototypes draw with, so a firebolt here is the firebolt Emberveil throws. Textures load in the
  // background; until they arrive every effect draws its geometry and nothing throws.
  const spellfx = new SpellFx(scene, { camera, scale: 1.15, maxParticles: 260, maxLive: 36 });
  Assets.open(new URL('../../../assets/', import.meta.url).href)
    .then(a => a.fxTextures(THREE, { size: 128 }))
    .then(t => spellfx.setTextures(t))
    .catch(() => { /* geometry only, which still reads fine */ });
  const skills = createSkillBar({ data: skillData, player, rpg });

  // god rays, lens flare and the moment the star drops behind a ridge — screen space, over the
  // canvas. `terrain` is rebound when you land on a new world, so it is read through the binding.
  sunfx = createSunFx({ balance, terrain: { heightAt: (x, z) => terrain.heightAt(x, z) } });
  sunfx.setEnabled(settings.get('sunfx') !== false);

  /**
   * Hang a status on whatever the skill just hit, and say so once. `cond_burnExtend` and
   * `cond_poisonStackPower` land here — this is the one place a status the PLAYER applies is made.
   */
  function landStatus(type, spec, enemy, power = 1) {
    if (!type || !spec) return;
    const first = !enemy.statuses?.[type];
    const longer = rpg.fx.sum(player, 'statusLonger', { type });
    const strength = rpg.fx.product(player, 'statusPower', { type });
    applyStatus(enemy, type, spec, power, { longer, strength });
    if (first) hud.log(`${enemy.name} is ${(spec.name || type).toLowerCase()}.`, 'good');
  }
  /** The callback every strike hands to the effect registry, so a crit can open a bleed. */
  const statusHook = (target, type, spec) => { if (target && spec) landStatus(type, spec, target, 1); };

  /**
   * Where the player is AIMING — which is not the same as where the player is standing.
   *
   * The camera sits over the left shoulder, so the crosshair's ray starts about 0.85 m to the left
   * of the body. Firing from the body along the same direction gives two parallel lines 0.85 m
   * apart, and every arrow lands that far to the right of the crosshair. (Reported in play: "arrows
   * land to the right of where I am aiming.")
   *
   * The fix every third-person game uses: find the point the CROSSHAIR is actually on — march the
   * camera's ray until it meets the ground, or stop at the first enemy under the reticle — then aim
   * the shot from the muzzle *at that point*. The two rays converge on the target instead of staying
   * parallel. `AIM_MIN` stops the correction going wild at point-blank range, where the angle
   * between the two would be enormous.
   */
  const AIM_FAR = 260, AIM_MIN = 7;
  function aim() {
    const cp = Math.cos(control.pitch);
    const lx = Math.sin(control.yaw) * cp, ly = Math.sin(control.pitch), lz = Math.cos(control.yaw) * cp;
    const eye = { x: control.x, y: control.y + 1.45, z: control.z };
    // in first person the camera IS the eye, so there is nothing to correct
    if (control.firstPerson) return { ...eye, dx: lx, dy: ly, dz: lz, focus: null, dist: AIM_FAR };

    const cam = camera.position;
    let t = AIM_FAR;
    for (let step = 2; step < AIM_FAR; step += 2) {
      const gx = cam.x + lx * step, gz = cam.z + lz * step;
      if (cam.y + ly * step <= terrain.heightAt(gx, gz)) { t = step; break; }
    }
    // a body under the reticle wins over the hill behind it
    const under = field.hitScan(cam.x, cam.y, cam.z, lx, ly, lz, { range: Math.min(t, AIM_FAR), width: 1.2 });
    if (under) t = under.distance;
    t = Math.max(AIM_MIN, t);

    const px = cam.x + lx * t, py = cam.y + ly * t, pz = cam.z + lz * t;
    const dx = px - eye.x, dy = py - eye.y, dz = pz - eye.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return { ...eye, dx: dx / len, dy: dy / len, dz: dz / len, focus: { x: px, y: py, z: pz }, dist: t, target: under?.enemy || null };
  }

  /** The ground point the player is looking at, for a skill that lands where you aim. */
  function groundTarget(range) {
    const a = aim();
    for (let t = 2; t < range; t += 1.5) {
      const gx = a.x + a.dx * t, gz = a.z + a.dz * t;
      if (a.y + a.dy * t <= terrain.heightAt(gx, gz)) return { x: gx, z: gz, y: terrain.heightAt(gx, gz), dist: t };
    }
    const gx = a.x + a.dx * range, gz = a.z + a.dz * range;
    return { x: gx, z: gz, y: terrain.heightAt(gx, gz), dist: range };
  }

  /** A ring of effect points on the actual ground, so an area spell does not float over a slope. */
  function ringPoints(cx, cz, radius, count = 8) {
    const points = [];
    for (let k = 0; k < count; k++) {
      const ang = (k / count) * Math.PI * 2;
      const px = cx + Math.cos(ang) * radius * 0.75, pz = cz + Math.sin(ang) * radius * 0.75;
      points.push(new THREE.Vector3(px, terrain.heightAt(px, pz) + 0.1, pz));
    }
    return points;
  }

  /**
   * One bolt of a skill: fly down the line, stop at the first body or the ground, burst there.
   *
   * BOLT_SPEED, and the bolt follows whoever it was aimed at. Both matter: at the effect module's
   * own pace a bolt takes about half a second to cross 7 m, and anything charging you has moved
   * several metres by the time it arrives, so a shot lined up on a wolf's nose burst behind it.
   */
  const BOLT_SPEED = 48;
  function fireBolt(plan, a, dx, dy, dz, strikeOpts, from, loud = true, hop = 0) {
    /**
     * PIERCE: do not stop at the first body.
     *
     * A bolt scans for what it hits and bursts there. The `pierce` talent says it should carry on
     * through, so with it the scan is simply not allowed to shorten the flight — the bolt flies its
     * full range and the splash along the way does the work.
     */
    const target = field.hitScan(a.x, a.y, a.z, dx, dy, dz, { range: plan.range, width: 1.4 });
    let dist = (plan.pierce && !hop) ? plan.range : (target ? target.distance : plan.range);
    for (let t = 2; t < dist; t += 2) {
      const gx = a.x + dx * t, gz = a.z + dz * t;
      if (a.y + dy * t <= terrain.heightAt(gx, gz)) { dist = t; break; }
    }
    const to = new THREE.Vector3(a.x + dx * dist, a.y + dy * dist, a.z + dz * dist);
    const flight = Math.max(90, (dist / BOLT_SPEED) * 1000);
    const chase = target?.enemy || null;
    return spellfx.projectile({ from, to, element: plan.element, ms: flight })
      .then(() => {
        const at = chase && chase.dying == null
          ? new THREE.Vector3(chase.x, chase.y + 0.9, chase.z)
          : to;
        spellfx.impact({ at, element: plan.element });
        const splash = plan.splash * (rpg.fx.sum(player, 'boltSplash') || 1);
        const hits = field.strikeArea(at.x, at.z, splash, player, { falloff: 0.5, ...strikeOpts });
        if (hits.length && loud) sound.combat('hit', { crit: hits.some(h => h.result.crit) });

        /**
         * CHAIN: jump to the next body along.
         *
         * `plan.chains` is how many more hops are left and `plan.chainFalloff` is what each one
         * keeps. The hop is fired as another bolt from where this one burst, at the nearest enemy
         * that is not the one just hit, so it reuses every rule above — including its own chain, one
         * shorter, which is what makes the talent terminate.
         */
        const left = (plan.chains || 0) - hop;
        if (left > 0) {
          const next = field.nearestTo(at.x, at.z, 12, chase) || null;
          if (next) {
            const ndx = next.x - at.x, ndz = next.z - at.z;
            const nlen = Math.hypot(ndx, ndz) || 1;
            const keep = plan.chainFalloff ?? 0.65;
            const weaker = { ...strikeOpts, power: (strikeOpts?.power ?? 1) * keep };
            fireBolt({ ...plan, range: 14 }, { x: at.x, y: at.y, z: at.z },
              ndx / nlen, 0, ndz / nlen, weaker,
              new THREE.Vector3(at.x, at.y, at.z), false, hop + 1);
          }
        }
      })
      .catch(() => { /* the scene went away mid-flight */ });
  }

  /**
   * Take the mouse back if nothing is holding it. Closing a panel used to leave the cursor loose and
   * the player had to click the world again before they could look around — which, with a panel's
   * click-to-close under the pointer, was easy to get wrong.
   */
  function regrab() {
    if (!panelOpen()) input.grab();
  }

  /**
   * Is a full-screen panel up?
   *
   * One predicate, used for two things: whether to take the mouse back, and whether the world is
   * running. The debug menu is deliberately NOT in here — it is a small dev overlay you often want
   * to read while something is moving.
   */
  function panelOpen() {
    return hud.sheetOpen || map.isOpen || chart.isOpen || talk.isOpen || settings.isOpen
      || rewardsOpen() || pauseMenu.isOpen;
  }

  /**
   * PAUSE WHILE A PANEL IS OPEN.
   *
   * "Make it so the game is paused when in your inventory, trade menu or dialog, options menu, map,
   * or other full screen indicator. If we add multiplayer later it should only work in
   * singleplayer." Reading your bag should not be a way to get killed, and standing in a shop
   * should not burn daylight.
   *
   * `multiplayer` is the seam that turn-off lives behind: set it and the world keeps running
   * whatever is on screen, which is the only behaviour that works when somebody else is playing too.
   */
  const multiplayer = false;
  function uiPaused() {
    return !multiplayer && panelOpen();
  }

  /** Fire skill slot `i`. Returns the plan it ran, or null if it could not. */
  function castSkill(i, { echo = false } = {}) {
    const plan = echo ? i : skills.use(i);
    if (!plan.ok) { if (plan.why) hud.log(plan.why); return null; }
    const a = aim();
    const from = new THREE.Vector3(a.x + a.dx * 0.6, a.y - 0.2, a.z + a.dz * 0.6);
    // War Cry raises the damage of everything, including the skill that follows it
    const power = plan.mult * outgoingFrom(player);
    const onHit = (enemy, result) => {
      if (plan.status && plan.statusSpec) landStatus(plan.status, plan.statusSpec, enemy, Math.max(1, plan.damage * 0.9 * (plan.statusMult || 1)));
      reportHit(enemy, result);
    };
    const strikeOpts = { power, element: plan.element, skill: plan.skill?.id, onHit, applyStatus: statusHook };

    // every "when you cast" affix and legendary gets its turn first
    if (!echo) {
      const cast = rpg.fx.onCast({ self: player, skill: plan.skill, applyStatus: statusHook });
      if (cast.shockwave) {
        spellfx.aoe({ points: ringPoints(control.x, control.z, 7), element: 'arcane', stagger: 0.03 });
        field.strikeArea(control.x, control.z, 7, player, { element: 'arcane', power: 1.2, onHit });
      }
      // `echo_cast`: a quarter of your skills go off a second time for half
      const chance = rpg.fx.sum(player, 'echo');
      if (chance > 0 && rpg.rng() < chance) {
        setTimeout(() => castSkill({ ...plan, mult: plan.mult * 0.5, damage: Math.round(plan.damage * 0.5) }, { echo: true }), 260);
      }
    }

    if (plan.kind === 'summon') {
      pets.summon(plan.pet, player, { count: plan.petCount, at: control }).then(made => {
        if (made.length) hud.log(`${made[0].name} answers.`, 'good');
      });
      spellfx.cast({ at: new THREE.Vector3(control.x, control.y + 0.4, control.z), element: plan.element, ms: 520 });
      sound.ui('click');
    } else if (plan.kind === 'beam') {
      // a line out from you: everything within `width` of the ray, out to `range`
      const points = [];
      for (let t = 2; t <= plan.range; t += 3) {
        const bx = a.x + a.dx * t, bz = a.z + a.dz * t;
        if (a.y + a.dy * t <= terrain.heightAt(bx, bz)) break;
        points.push(new THREE.Vector3(bx, a.y + a.dy * t, bz));
      }
      if (points.length) spellfx.aoe({ points, element: plan.element, stagger: 0.015 });
      let healed = 0;
      for (const e of field.enemies) {
        if (e.dying != null) continue;
        const ex = e.x - a.x, ez = e.z - a.z;
        const along = ex * a.dx + ez * a.dz;
        if (along < 0 || along > plan.range) continue;
        if (Math.hypot(ex - a.dx * along, ez - a.dz * along) > plan.width + (e.reach || 2) * 0.3) continue;
        const result = rpg.strike(player, e, field.rng, { multiplier: power, element: plan.element, applyStatus: statusHook });
        e.hitFlash = 0.18;
        if (e.state !== 'chase') e.state = 'chase';
        onHit(e, result);
        healed += Math.round(result.amount * (plan.healFrac || 0));
        spellfx.impact({ at: new THREE.Vector3(e.x, e.y + 0.9, e.z), element: plan.element, crit: result.crit });
        if (result.dead) field.kill(e);
      }
      if (healed) { player.hp = Math.min(player.maxHp, player.hp + healed); hud.log(`Drained ${healed} back.`, 'good'); }
      sound.combat('hit');
    } else if (plan.kind === 'ground') {
      // it lands where you are looking, not where you are
      const spot = groundTarget(plan.range);
      spellfx.aoe({ points: ringPoints(spot.x, spot.z, plan.radius), element: plan.element, stagger: 0.05 });
      spellfx.impact({ at: new THREE.Vector3(spot.x, spot.y + 0.6, spot.z), element: plan.element });
      const hits = field.strikeArea(spot.x, spot.z, plan.radius, player, { falloff: 0.55, ...strikeOpts });
      sound.combat(hits.length ? 'hit' : 'swing', { crit: hits.some(h => h.result.crit) });
      // `linger`: the ground keeps burning after the cast
      if (plan.ground > 0) {
        dropPool({
          x: spot.x, z: spot.z,
          r: plan.groundRadius || plan.radius,
          seconds: plan.ground, element: plan.element, power: power * 0.35,
        });
      }
    } else if (plan.kind === 'dash') {
      // you move: everything along the line takes the hit, and you end up at the far end of it
      const spot = groundTarget(plan.range);
      const dist = Math.min(plan.range, spot.dist);
      const points = [];
      for (let t = 1; t <= dist; t += 2) {
        const bx = control.x + a.dx * t, bz = control.z + a.dz * t;
        points.push(new THREE.Vector3(bx, terrain.heightAt(bx, bz) + 0.3, bz));
      }
      spellfx.aoe({ points, element: plan.element, stagger: 0.02 });
      const hits = [];
      for (let t = 1; t <= dist; t += 2) {
        hits.push(...field.strikeArea(control.x + a.dx * t, control.z + a.dz * t, plan.splash, player, { falloff: 0.8, ...strikeOpts }));
      }
      control.teleport(control.x + a.dx * dist, control.z + a.dz * dist);
      control.swing = Math.max(control.swing, 0.35);
      sound.combat(hits.length ? 'hit' : 'swing');
    } else if (plan.kind === 'self') {
      if (plan.heal) {
        const before = player.hp;
        // `camp_mend` lifts anything that mends you
        const lift = 1 + rpg.fx.sum(player, 'healBonus');
        player.hp = Math.min(player.maxHp, player.hp + Math.round(plan.heal * lift));
        spellfx.heal({ at: new THREE.Vector3(control.x, control.y + 0.9, control.z) });
        hud.log(`${plan.skill.name} closes ${Math.round(player.hp - before)} damage.`, 'good');
      }
      if (plan.status && plan.statusSpec) {
        applyStatus(player, plan.status, plan.statusSpec, 1);
        // a rallying skill puts the same buff on everything following you
        if (plan.pets || plan.status === 'regen') {
          for (const pet of pets.pets) if (pet.dying == null) applyStatus(pet, plan.status, plan.statusSpec, 1);
        }
        hud.log(`${plan.statusSpec.name}.`, 'good');
      }
      spellfx.cast({ at: new THREE.Vector3(control.x, control.y + 0.4, control.z), element: plan.element, ms: 420 });
      sound.ui('click');
    } else if (plan.kind === 'melee') {
      fx.swipe({ x: control.x, y: control.y, z: control.z, yaw: control.yaw, reach: plan.reach, arc: plan.arc });
      const hits = field.strike(control, player, { reach: plan.reach, arc: plan.arc, ...strikeOpts });
      sound.combat(hits.length ? 'hit' : 'swing', { crit: hits.some(h => h.result.crit) });
      for (const h of hits) spellfx.impact({ at: new THREE.Vector3(h.enemy.x, h.enemy.y + 0.9, h.enemy.z), element: plan.element, crit: h.result.crit });
      control.swing = Math.max(control.swing, 0.35);
    } else if (plan.kind === 'around') {
      // a ring on the ground, drawn where the ground actually is so it does not float on a slope
      const points = [];
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        const px = control.x + Math.cos(ang) * plan.radius * 0.75, pz = control.z + Math.sin(ang) * plan.radius * 0.75;
        points.push(new THREE.Vector3(px, terrain.heightAt(px, pz) + 0.1, pz));
      }
      spellfx.aoe({ points, element: plan.element, stagger: 0.04 });
      const hits = field.strikeArea(control.x, control.z, plan.radius, player, { falloff: 0.6, ...strikeOpts });
      sound.combat(hits.length ? 'hit' : 'swing');
      // `linger` is offered on the nova tree too, and a nova leaves its pool where you stood
      if (plan.ground > 0) {
        dropPool({
          x: control.x, z: control.z,
          r: plan.groundRadius || plan.radius,
          seconds: plan.ground, element: plan.element, power: power * 0.35,
        });
      }
      // Consecrate mends you as it burns them
      if (plan.healFrac) {
        const back = Math.round(player.maxHp * plan.healFrac);
        player.hp = Math.min(player.maxHp, player.hp + back);
        spellfx.heal({ at: new THREE.Vector3(control.x, control.y + 0.9, control.z) });
      }
      control.swing = Math.max(control.swing, 0.35);
    } else {
      // A bolt — or a FAN of them. Multi Shot, Chain Bolt and Pinning Shot fire several at once,
      // spread across `plan.spread` radians, because a "multi shot" that fires one arrow is not one.
      sound.combat('bow');
      const n = plan.projectiles || 1;
      for (let k = 0; k < n; k++) {
        // fan them either side of where you are aiming; a single bolt keeps the exact line
        const off = n === 1 ? 0 : (k / (n - 1) - 0.5) * plan.spread;
        const cs = Math.cos(off), sn = Math.sin(off);
        const dx = a.dx * cs - a.dz * sn, dz = a.dx * sn + a.dz * cs, dy = a.dy;
        fireBolt(plan, a, dx, dy, dz, strikeOpts, from, k === 0);
      }
    }
    hud.setPlayer(player);
    return plan;
  }

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
    rpg, terrain, settings, seed, craft, zones,
    pets: { roster: () => pets?.roster() || [] },
    // Opening the sheet gives the mouse back IMMEDIATELY — this was the bug: the pointer stayed
    // locked, so the cursor was invisible and none of the buttons could be clicked.
    onOpen: () => { input.release(); },
    // …and closing it takes the mouse BACK. It used to wait for a click on the canvas, so pressing
    // I to leave the sheet left you with a visible cursor and no way to look around until you
    // clicked — which also fired an attack.
    onClose: () => { regrab(); },
    onRecycle: (item, { quiet = false } = {}) => {
      const at = player.bag.indexOf(item);
      if (at < 0) return;
      player.bag.splice(at, 1);
      const got = craft.recycle(item);
      if (!quiet) {
        const text = Object.entries(got).map(([id, k]) => `${k} ${craft.M[id]?.name || id}`).join(', ');
        hud.log(`Recycled ${item.name}${text ? ' → ' + text : ''}.`, 'loot');
        sound.ui('click');
      }
      hud.setPlayer(player);
      autoSave();
    },
    onCraft: (recipeId, item, opts) => {
      const out = craft.apply(recipeId, item, { magicFind: player.derived?.magicFind || 0, ...opts, player });
      if (!out.ok) { hud.log(out.why || 'That cannot be done.', 'bad'); return; }
      // a brand put on at the bench re-attunes the weapon, so the swing carries the new element
      if (item && out.ok) { item.castElement = null; attuneWeapon(item); }
      if (out.made) {
        attuneWeapon(out.made);
        player.bag.push(out.made);
        hud.log(`${out.text} It is in your bag.`, out.lucky ? 'level' : 'loot');
        sound.loot(out.made);
      }
      else { hud.log(out.text, 'loot'); sound.equip(); }
      rpg.refresh(player);
      applyGearLook();
      hud.setPlayer(player);
      autoSave();
    },
    onEquip: (item, unequipSlot) => {
      if (unequipSlot) { const off = rpg.unequip(player, unequipSlot); if (off) hud.log(`Took off ${off.name}.`); }
      else {
        const out = rpg.equip(player, item);
        if (out?.refused) hud.log(out.refused, 'bad');
        else { hud.log(`Equipped ${item.name}.`, 'loot'); sound.equip(); }
      }
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
      // who you have already put down — it was in the save and never shown on the screen
      defeated: campaign.defeatedNemeses || [],
      bestiary: campaign.bestiary,
      names: Object.fromEntries(bestiary.enemies.map(e => [e.id, e.name])),
    }),

    /**
     * WHAT YOU ARE DOING, in one line under the health bars.
     *
     * The tracked marker if there is one; otherwise the nearest settlement, because on a fresh run
     * the honest answer to "what now" is "go and find somebody to talk to". Everything here already
     * existed — the marker book, the bearing maths and `distanceText` — it was just never on screen.
     */
    objective: () => {
      if (dungeon) return { name: dungeon.name, where: 'find the way down' };
      const tracked = markers.tracked()[0];
      if (tracked) {
        const b = markers.bearing(tracked, control, terrain);
        return { name: tracked.name, where: distanceText(b.distance) };
      }
      const town = features.nearestSettlement?.(control.x, control.z) || null;
      if (town) {
        const d = Math.hypot(town.x - control.x, town.z - control.z);
        return { name: town.name, where: d < 90 ? 'look for work here' : distanceText(d) };
      }
      const here = zones.at(control.x, control.z);
      return here ? { name: here.name, where: `level ${here.minLevel}–${here.maxLevel}` } : null;
    },

    // ---- The Territory: three more things the Journal shows
    standings: () => rankedFactions(factionData, standings),
    factionBands: () => factionData.bands || [],
    factionName: key => intro.fullName(key),
    distanceTo: place => distanceText(Math.hypot((place?.x ?? 0) - control.x, (place?.z ?? 0) - control.z)),
    /** What one faction owes you, and whether you have earned it yet. */
    factionRewards: key => {
      if (!key) return [];
      const ranks = rewardData.ranks || [];
      const value = standings.get(key);
      return (rewardData.rewards?.[key] || []).map(r => {
        const rank = ranks.find(x => x.key === r.rank);
        return { ...r, at: rank?.at ?? 0, rankName: rank?.name || r.rank, earned: value >= (rank?.at ?? 0) };
      });
    },
    /** Everything you have earned, everywhere — what the rest of the game asks before it acts. */
    perks: () => earnedRewards(),
    /** The five deeds worth knowing about, biggest first — the rest are variations on them. */
    factionDeeds: () => ([
      ['finish a job for them', factionData.deeds?.job_done],
      ['see a caravan of theirs home', factionData.deeds?.caravan_escorted],
      ['clear their enemy\'s camp', factionData.deeds?.camp_cleared],
      ['kill one of their patrol', factionData.deeds?.patrol_killed],
      ['rob one of their caravans', factionData.deeds?.caravan_robbed],
      ['desecrate one of their places', factionData.deeds?.landmark_desecrated],
    ].filter(row => Number.isFinite(row[1]))),
    territoryHere: () => (hud.here ? holdings.of(hud.here.id) : null),
    board: () => localBoard,
    rumours: () => rumours.all(),
    /**
     * Take a job off the local board.
     *
     * A generated job is richer than the four shapes the quest log counts against, so it goes in with
     * `logKind` and keeps its own words — see the note in js/jobgen.js.
     */
    onTakeJob: job => {
      if (!job || job.taken) return;
      job.taken = true;
      questLog.add({
        ...job,
        kind: job.logKind || 'visit',
        giverName: job.faction ? intro.nameFor(job.faction) : 'a notice board',
        fromName: job.zoneName,
      });
      markers.syncQuests(questLog.active);
      sound.ui('click');
      hud.log(`Taken: ${job.title}.`, 'good');
      autoSave();
    },
    onTakeTalent: id => { if (rpg.takeTalent(player, id)) { sound.ui('click'); hud.log(`Talent taken: ${rpg.talentList.find(t => t.id === id)?.name}.`, 'level'); autoSave(); } hud.setPlayer(player); },
    onSpendPassive: id => { if (rpg.spendPassive(player, id)) { sound.ui('click'); autoSave(); } hud.setPlayer(player); },

    // ---- round 7: the perk forest, the per-skill talent trees, and the vehicle dropdowns
    onTakePerk: id => {
      const out = allocatePerk(player, rpg.forest, id);
      if (!out.ok) { hud.log(out.why, 'bad'); sound.ui('error'); return; }
      sound.ui('click');
      hud.log(`Perk taken: ${out.node.name}.`, 'level');
      rpg.refresh(player, { full: true });
      hud.setPlayer(player);
      autoSave();
    },
    onRefundPerk: id => {
      const out = refundOnePerk(player, rpg.forest, id);
      if (!out.ok) { hud.log(out.why, 'bad'); sound.ui('error'); return; }
      sound.ui('click');
      hud.log(`${out.node.name} given back.`, 'level');
      rpg.refresh(player, { full: true });
      hud.setPlayer(player);
      autoSave();
    },
    onRefundPerks: () => {
      const back = refundPerks(player);
      hud.log(back ? `${back} perk point${back === 1 ? '' : 's'} back. Spend them again.` : 'Nothing to take back.', back ? 'level' : '');
      rpg.refresh(player, { full: true });
      hud.setPlayer(player);
      autoSave();
    },
    onPickTalent: (skillId, tier, nodeId, shape) => {
      const out = pickTalent(player, skillId, tier, nodeId, { shape });
      if (!out.ok) { hud.log(out.why, 'bad'); sound.ui('error'); return; }
      sound.ui('click');
      hud.log(`${out.node.name} on ${skillId}.`, 'level');
      hud.setPlayer(player);
      autoSave();
    },
    onClearTalent: (skillId, tier) => { clearTalent(player, skillId, tier); sound.ui('click'); hud.setPlayer(player); autoSave(); },
    onSelectVehicle: (slot, key) => {
      if (!selectVehicle(player, slot, key)) return;
      sound.ui('click');
      hud.log(`${vehicleFor(player, slot)?.name} it is.`, '');
      hud.setPlayer(player);
      autoSave();
    },
  });
  hud.setPlayer(player);

  /** A hit, in the log AND over the thing you hit — see `hud.hit`. */
  function reportHit(enemy, result) {
    const at = new THREE.Vector3(enemy.x, (enemy.y ?? 0) + (enemy.height || 1.7) * 0.9, enemy.z);
    if (result.dodged) {
      hud.log(`${enemy.name} dodges.`);
      hud.hit(at, 'miss', 'miss', camera);
      return;
    }
    hud.log(`You hit ${enemy.name} for ${result.amount}${result.crit ? ' (critical)' : ''}.`, result.crit ? 'good' : '');
    hud.hit(at, result.amount, result.crit ? 'crit' : '', camera);
  }

  /**
   * The reward popup, shared with Emberveil (`shared/rewards.js`): a chest lands, bursts, the gold
   * and xp count up, and the items fly out one at a time with their rarity colour. Used for a
   * chest, a boss, a rare and a cleared dungeon — everything with a haul worth stopping for.
   */
  function rewards(spec) {
    state.paused = true;
    input.release();
    // the HUD, the skill bar and the "E open the gilded chest" prompt were all still legible through
    // the popup, which is a shared overlay Emberveil uses too — so hide ours rather than dim theirs
    document.body.classList.add('popup-open');
    return showRewards(spec, {
      base: '../../assets/data/ui',
      sounds: {
        open: () => sound.ui('open'),
        item: r => sound.loot({ rarity: r }),
        close: () => sound.ui('click'),
      },
    }).finally(() => { state.paused = false; document.body.classList.remove('popup-open'); });
  }

  /**
   * One item, in the shape the reward popup wants — and the one line you actually want.
   *
   * The card showed the item's own numbers and nothing else, which is not the question you are asking
   * when a chest has just opened. The question is "is this better than what I have on", and the
   * inventory already computes that number; the popup just never asked for it.
   */
  function rewardItem(item) {
    const slot = item.type === 'weapon' ? 'weapon' : item.slot === 'ring1' ? 'ring' : item.slot;
    const worn = player.equipment?.[slot];
    const delta = worn ? itemScore(item) - itemScore(worn) : null;
    const verdict = delta == null ? 'nothing in that slot yet'
      : delta > 0 ? `+${delta} over your ${worn.name}`
      : delta < 0 ? `worse than your ${worn.name}`
      : `no better than your ${worn.name}`;
    return {
      name: displayName(item), rarity: item.rarity, unique: !!item.isUnique, set: !!item.setId,
      slot: item.type === 'weapon' ? 'Weapon' : (SLOT_LABELS[slot] || item.slot || ''),
      lines: [
        item.dmg ? `${item.dmg[0]}–${item.dmg[1]} damage` : null,
        item.armor ? `${item.armor} armour` : null,
        ...(item.affixes || []).filter(a => !a.baseIntrinsic).slice(0, 2).map(a => describeAffixText(a)),
        verdict,
      ].filter(Boolean),
    };
  }
  function describeAffixText(a) { try { return describeAffix(a); } catch { return `${a.name || a.stat} ${a.value}`; } }

  /** Hand the player a haul: items to the bag, gold to the purse, materials to the materials bag. */
  function takeHaul({ items = [], gold = 0, mats = {} } = {}) {
    for (const it of items) { player.bag.push(it); campaign.onLoot(it); }
    player.gold += gold;
    craft.materials.addAll(mats);
    for (const it of items) for (const q of questLog.onLoot({ baseKey: it.baseKey })) {
      hud.log(`${q.title}: ${questLog.progressText(q)}`, q.done ? 'good' : '');
    }
    hud.setPlayer(player);
  }

  /**
   * Kills near a hostile camp put it down.
   *
   * This is the one repeatable action the whole territory layer hangs off: small, obvious, and enough
   * of them change who holds the ground. Four kills inside a camp's own footprint clears it — the
   * camp's grip on the zone falls, its rival's claim rises, and the people who owned it notice.
   */
  const siteKills = new Map();
  function creditKill(x, z) {
    const here = zones.at(x, z);
    if (!here) return;
    for (const site of holdings.sitesIn(here.id, { hostileOnly: true })) {
      const reach = 60 + (site.size || 1) * 25;
      if (Math.hypot(site.x - x, site.z - z) > reach) continue;
      const need = 3 + (site.size || 1);
      const n = (siteKills.get(site.id) || 0) + 1;
      siteKills.set(site.id, n);
      if (n < need) { hud.log(`${site.name}: ${n} of ${need}.`); return; }
      siteKills.delete(site.id);
      const out = holdings.clearSite(here.id, site.id);
      if (!out) return;
      hud.log(`${site.name} is cleared.`, 'good');
      sound.questDone();

      /**
       * …AND WHOEVER WAS BEING HELD IN IT WALKS OUT.
       *
       * They stop being captives, they say something worth hearing, and the standing moves — a
       * faction remembers people you got out far longer than it remembers a cleared camp. Without
       * this, freeing prisoners was a line of data that only the zone record ever saw.
       */
      /**
       * AND THE REST OF THE STRONGHOLD'S `gives`, WHICH NOBODY READ EITHER.
       *
       * `data/strongholds.json` pays out in xp, loot, standing, perk points, an opened dungeon, a
       * revealed zone and a lifted siege. `territory.clearSite` moves the grip and the claim — that
       * part worked — and every one of these went straight in the bin, so the difference between
       * clearing a bandit camp and taking a Stonecount keep was two lines in the log.
       */
      const near = sites.nearest?.(site.x, site.z, 40) || null;
      const pays = site.gives || site.spec?.gives || near?.gives || near?.spec?.gives || {};
      if (pays.xp) {
        const levels = rpg.gainXp(player, Math.round(pays.xp * (1 + (player.level - 1) * 0.15)));
        if (levels > 0) { hud.log(`Level ${player.level}.`, 'level'); }
      }
      if (pays.loot) {
        // a guaranteed grade, dropped where the boss fell rather than into the bag, so it is found
        chests.place(pays.loot === 'legendary' ? 'gilded' : 'iron', site.x + 2, site.z + 2,
          { level: player.level, floor: pays.loot, name: `${site.name}: the spoils` });
        hud.log(`Something ${pays.loot} is in there.`, 'loot');
      }
      if (pays.perkPoint) {
        player.bonusPerks = (player.bonusPerks || 0) + pays.perkPoint;
        hud.log(`A perk point for taking ${site.name}.`, 'level');
      }
      if (pays.standing) standings.deed(pays.standing, 'stronghold_taken');
      if (pays.revealZone) { map.revealZone?.(here.id); hud.log(`${here.name} goes on your chart.`, 'good'); }
      if (pays.opensDungeon) hud.log('Behind the keep, a stair goes down. It was not there before.', 'loot');
      if (pays.liftsSiege) {
        holdings.press?.(here.id, 0.18, { claim: 0.1 });
        hud.log(`The siege on ${here.name} lifts.`, 'level');
      }

      rumours.add(`${site.name} in ${here.name} has been cleared out`, { zone: here, from: 'you, mostly' });
      autoSave();
      return;
    }
  }

  /** What happens when something dies. Named, because the enemy field is rebuilt on every world. */
  function onEnemyKilled(e) {
    player.kills++;
    freePrisonersOf(e);
    // §7 — a raider going down is progress through the wave, and the last one ends the raid
    if (e.raider) {
      const out = defence.killed();
      if (out?.raidDone && out.prize?.crate) {
        chests.place(out.prize.crate, control.x + 3, control.z + 3, { level: player.level });
        sound.questDone();
      } else if (out?.cleared && !out.raidDone) {
        defence.spawnWave({ level: player.level });
      }
    }
    if (!dungeon) creditKill(e.x ?? control.x, e.z ?? control.z);
    sound.combat('death', { beast: e.kind !== 'humanoid' });
    const settled = campaign.onKill(e.defId);
    if (settled === 'nemesis') {
      hud.log('The grudge is settled.', 'level');
      sound.questDone();
    }
    const back = rpg.onKillRestore(player);
    if (back.hp || back.mp) hud.log(`The kill returns ${[back.hp && `${back.hp} health`, back.mp && `${back.mp} mana`].filter(Boolean).join(' and ')}.`);

    // every on-kill affix and legendary power gets its turn
    const post = rpg.fx.onKill({ self: player, target: e, applyStatus: (t, type, spec) => applyStatus(t, type, spec) });
    if (post.heal) player.hp = Math.min(player.maxHp, player.hp + post.heal);
    if (post.petHeal) pets.heal(post.petHeal);
    if (post.gold) player.gold += post.gold;
    if (post.cooldownCut) skills.refresh(post.cooldownCut);
    if (post.rally) applyStatus(player, 'rally', skillData.statuses.rally, 1);
    if (post.breath) {
      for (const other of field.near(e.x, e.z, post.breath.radius, e)) {
        field.strikeArea(other.x, other.z, 1.5, player, { element: post.breath.element, power: 0.6 });
        applyStatus(other, post.breath.status, skillData.statuses[post.breath.status], 6);
      }
      spellfx.impact({ at: new THREE.Vector3(e.x, e.y + 1, e.z), element: 'fire' });
    }
    if (post.spreadStatuses && e.statuses) {
      for (const other of field.near(e.x, e.z, post.spreadStatuses, e)) {
        for (const [type, st] of Object.entries(e.statuses)) applyStatus(other, type, skillData.statuses[type], st.power);
      }
    }

    const levels = rpg.gainXp(player, e.xp);
    player.gold += e.gold;
    hud.log(`${e.name} falls. +${e.xp} xp, +${e.gold} gold.`, e.rank && e.rank !== 'normal' ? 'loot' : 'good');
    if (levels) {
      /**
       * NAME THE CURRENCY THE GAME ACTUALLY PAYS IN.
       *
       * This said "3 points to spend (press I)" at every level — `balance.progression.attrPerLevel`
       * is still 3 — but attributes stopped being bought a point at a time in round 7 and
       * `player.pendingAttr` is never incremented by anything, so pressing I showed four dead `+`
       * buttons and "no points to spend". A level buys a PERK now, and sometimes a talent.
       */
      const gained = pointsFor(player.level) - pointsFor(player.level - levels);
      const bits = [gained ? `${gained} perk point${gained === 1 ? '' : 's'}` : null,
        player.pendingTalent ? `${player.pendingTalent} talent` : null].filter(Boolean);
      hud.log(`Level ${player.level}!${bits.length ? ` ${bits.join(' and ')} to spend — press I.` : ''}`, 'level');
      sound.levelUp();
    }

    // the body itself is worth something — hide, bone, plate, and the rare components
    const mats = craft.harvest(e);
    // an extra roll from the `forage_feast` legendary
    if (rpg.fx.sum(player, 'scavenge') > 0 && field.rng() < rpg.fx.sum(player, 'scavenge')) craft.materials.add('scrap', 2);

    const drops = rpg.rollDrops(e, { rng: field.rng, magicFind: player.derived.magicFind });
    if (rpg.fx.sum(player, 'extraDrop') > 0 && field.rng() < rpg.fx.sum(player, 'extraDrop')) {
      const bonus = rpg.rollDrop({ level: e.level, rng: field.rng, magicFind: player.derived.magicFind, bases: e.dropBases, chance: 1 });
      if (bonus) drops.push(bonus);
    }

    // A boss or a rare leaves a BAG rather than pushing five things silently into the inventory.
    // Walking over to pick it up is the beat that makes the kill feel finished.
    if ((e.rank === 'boss' || e.rank === 'rare') && (drops.length || Object.keys(mats).length)) {
      /**
       * "When receiving a loot crate from a kill, ensure there is always at least a rare item in
       * it."
       *
       * A bag is the reward for a fight you had to work for, and walking across a field to open one
       * holding two normals is worse than getting nothing. If the rolls did not produce a rare, one
       * is rolled with `floor: 'rare'` and added — and the beacon over the bag then shows it,
       * because the beacon reads the best thing inside.
       */
      const RANKS = ['normal', 'magic', 'rare', 'legendary'];
      if (!drops.some(d => RANKS.indexOf(d.rarity) >= 2)) {
        const promised = rpg.rollDrop({
          level: e.level, rng: field.rng, magicFind: player.derived.magicFind,
          bases: e.dropBases, chance: 1, floor: 'rare',
        });
        if (promised) drops.push(promised);
      }
      chests.dropBag(e.x, e.z, {
        items: drops, gold: Math.round(e.gold * 0.5), mats: {},
        title: e.rank === 'boss' ? e.name + ' falls' : 'A rare kill',
        subtitle: e.rank === 'boss' ? 'Everything it was hoarding is yours.' : `${e.name} was carrying something.`,
      });
      hud.log('It dropped a bag. Walk over it.', 'loot');
    } else {
      for (const drop of drops) {
        player.bag.push(drop);
        hud.log(`${e.name} dropped ${drop.name}.`, 'loot');
        sound.loot(drop);
        campaign.onLoot(drop);
        for (const q of questLog.onLoot({ baseKey: drop.baseKey })) hud.log(`${q.title}: ${questLog.progressText(q)}`, q.done ? 'good' : '');
      }
    }
    for (const q of questLog.onKill({ defId: e.defId })) hud.log(`${q.title}: ${questLog.progressText(q)}`, q.done ? 'good' : '');
    if (e === bossUnit) { bossUnit = null; hud.boss(null); if (dungeon) onDungeonBossDown(); }
    hud.setPlayer(player);
    autoSave();
  }

  function makeField(forTerrain = terrain, forZones = zones) {
    return new EnemyField({
      // C8: a Fiery enemy is visibly on fire because the field hands the modifier one of spellfx's
      // existing looping auras. Without this the modifier still works and still wears its coloured
      // ring — it just does not burn.
      spellfx,
      scene, terrain: forTerrain, rpg, defs: bestiary.enemies,
      bosses: bestiary.bosses || [], modifiers: bestiary.modifiers || [],
      zones: forZones, balance: { ...balance, seed },
      onLog: (t, c) => hud.log(t, c),
      onKill: onEnemyKilled,
      // a rare gets a real name, in the language of the region it turned up in
      nameRare,
    });
  }
  /**
   * A rare or a stronghold's boss gets a real name, in the language of the region it turned up in.
   *
   * Declared out here rather than inline in `makeField`'s options because two callers need it: the
   * enemy field, and `sites.populate` when it names a camp's boss. It was an object property, and
   * the stronghold wiring called it as a bare identifier — "nameRare is not defined", thrown on
   * walking into the first camp.
   */
  function nameRare(def, rng) {
    if (!namegen) return null;
    const race = zones.at(control.x, control.z)?.race || 'human';
    return namegen.generate('person.full', { race, seed: Math.floor(rng() * 1e9) })?.text?.split(' ')[0] || null;
  }

  let field = makeField();
  // whatever stops the player stops an enemy too
  field.solids = [props.solids, features.solids];

  // ---------------------------------------------------------------- companions
  const pets = createPets({
    scene, terrain, rpg, defs: bestiary.pets || [], balance: { ...balance, seed },
    field, statuses: skillData.statuses,
  });
  if (classDef.pet) {
    // "One more companion follows you" — the perk existed, and the class summon ignored it, so the
    // answer to "what companion?" was "none, ever". It is the class's own, one more of them.
    const pet = { ...classDef.pet, count: (classDef.pet.count ?? 1) + (player.derived?.petSlots || 0) };
    pets.summonForClass(classId, player, pet).then(made => {
      if (made.length) hud.log(`${player.name} ${pet.verb || 'calls'} ${made.length === 1 ? made[0].name : made.length + ' companions'}.`, 'good');
    });
  }

  // ---------------------------------------------------------------- treasure
  let chests = createChests(scene, terrain, { seed, balance, zones, rpg, collide: props.solids });
  let gates = createGates(scene, terrain, { balance, zones, radius: balance.features?.radius ?? 2600, collide: features.solids });
  // set-piece encounters on the road: warbands, ambushes, swarms, a rare with an escort
  let encounters = createEncounters({
    field, zones, terrain, balance, data: encounterData,
    onLog: (t, c) => hud.log(t, c),
    isNight: () => sky.isNight,
  });

  // camps with a fire in them, and the lairs the world bosses keep
  let sites = createSites(scene, terrain, { seed, balance, zones, collide: features.solids, radius: balance.features?.radius ?? 2600 });
  /**
   * A set piece near a stronghold is that stronghold's people.
   *
   * Inert until this is called: a warband rolled within a few hundred metres of a fort now draws
   * from THAT garrison and says where it came from, instead of being whatever the biome happens to
   * hold. It is the difference between a random fight and a patrol.
   */
  encounters.setSites?.(sites);
  // sites.js and encounters.js both put chests down now — a boss hoard, a landmark cache, the bait
  // in a trap. They find the field through a registry when nobody hands it over; this is the front
  // door, and it means the registry is a fallback rather than the only route.
  encounters.setChests?.(chests);

  /**
   * ================= THE BUILDING EXPANSION =================
   *
   * BUILDING_EXPANSION.md, wired. The order matters and it is the order of the doc: stores hold
   * things, the grid powers the things that move them, the works turn ore into parts, the board
   * turns effort into progress, the colony supplies the effort, and `build` is the hand that puts
   * any of it on the ground.
   */
  const stores = createStoreNetwork({ power: powerData || {}, materials: resourceData || {} });
  const grid = createGrid({ power: powerData || {}, stores, log: (t, c) => hud.log(t, c) });
  /**
   * The pools and the grid come back BEFORE build.load runs.
   *
   * `build.load` walks every piece and rejoins it to both, and `stores.add`/`grid.add` on an id
   * that is already there replaces it — so loading the contents first and the buildings second
   * keeps the coal in the crate rather than handing back an empty one of the same name.
   */
  if (save?.stores) stores.load(save.stores);
  if (save?.grid) grid.load(save.grid);
  const works = createWorks({
    refining: refiningData || {}, resources: resourceData || {},
    stores, grid, log: (t, c) => hud.log(t, c),
    rareElement: planet?.rare?.[0] || null,
  });
  /**
   * The benches, their queues, and which recipes you have unlocked by doing them.
   *
   * Loaded BEFORE `build.load` puts the pieces back, so `joinSystems` finds each machine already
   * registered and leaves it alone rather than replacing a half-smelted batch with a fresh one.
   */
  if (save?.works) works.load(save.works);
  /**
   * ORE IN THE GROUND, ACROSS THE WHOLE WORLD.
   *
   * This was `createNodeField({ data, seed, terrain })` — a function that takes none of those three
   * — so every seam in the game was scattered inside a 300 m circle around the ORIGIN, about
   * twenty-nine kilometres from where the player lands. Nobody could ever have found one.
   * `createNodeWorld` generates a 512 m tile at a time from the world seed folded with the tile's
   * own coordinates, so a seam stays where you left it without any of them being saved.
   */
  let ore = createNodeWorld({
    data: resourceData || {}, seed, terrain, planet,
    band: planet?.band || 'medium',
  });
  if (save?.ore) ore.load(save.ore);

  /** Drills, routes, and the sum that says a long route delivers less. */
  const mining = createMining({
    data: resourceData || {}, ore, stores, grid, bag: materials,
    log: (t, c) => hud.log(t, c),
  });
  // (the saved drills are reattached after `build` exists — see below. `build` is a const declared
  // a hundred lines down, so doing it here would be a crash on any save with a drill in it.)
  /**
   * §7 — the raid, which the player STARTS.
   *
   * "[the tower defence] might be better as a quest rather than a random event, so the player can
   * decide when to start on it rather than being a burden." Nothing here fires on its own: the
   * world offers, the player accepts, and the bell is the player choosing the hour.
   */
  const defence = createDefence({
    data: raidData || null, bestiary, grid,
    rng: rpg.rng, log: (t, c) => hud.log(t, c), spellfx,
    // getters: the enemy field is rebuilt on every landing, and `build` is declared below this
    getField: () => field,
    getBuild: () => build,
  });
  // the raid you had taken on, and how far through it you were. AFTER `defence` exists: putting
  // this up with the other loads read a `const` a hundred lines before its declaration, which is
  // a crash on every save that has a base in it and on no save that does not.
  if (save?.defence) defence.load(save.defence);

  /** The seams, drawn. One InstancedMesh per kind — see js/ore-view.js. */
  let oreView = createOreView(scene, { data: resourceData || {} });

  /** Ten units of work, from a swing, a machine or a citizen — js/work.js keeps them the same. */
  const board = new WorkBoard(save?.work || {});
  const colony = createColony({
    data: colonyData || null, board, seed,
    name: `${player.name}'s holding`,
  });
  if (save?.colony) colony.load(save.colony);
  const farm = createFarm({ data: cropData || null, board, seed });
  if (save?.farm) farm.load(save.farm);

  /** Exactly one portal, ever — the whole state is one variable in js/portal.js. */
  const portals = createPortals({
    saved: save?.portal || null,
    spotOk: (x, z) => !terrain.waterAt(x, z) && !terrain.underwater(x, z) && terrain.slopeAt(x, z, 4) < 0.6,
  });

  /**
   * Which digging tool you are swinging.
   *
   * There is no pick slot in Farhold and adding one for this would be a new inventory rule nobody
   * asked for. A weapon's own material is a good stand-in — the difference between chipping at a
   * seam with a bronze sword and cutting it with a steel one — so a player who has been upgrading
   * their gear is already mining faster without having to be told.
   */
  function toolTierFor(p) {
    const weapon = p?.equipment?.weapon || p?.equipment?.offhand || null;
    const name = `${weapon?.material || ''} ${weapon?.name || ''}`.toLowerCase();
    if (/steel|adamant|star|void|mithr/.test(name)) return 'steel_tool';
    if (/iron|bronze|copper|silver/.test(name)) return 'iron_tool';
    if (/stone|bone|wood/.test(name)) return 'stone_tool';
    return weapon ? 'iron_tool' : 'hands';
  }

  /**
   * Where the camera is pointing at the ground, in world metres.
   *
   * Marched rather than solved: the terrain is a noise field with rivers and roads carved into it,
   * so there is no closed form for "where does this ray meet it". Forty one-metre steps covers the
   * whole useful build range and costs forty height lookups, which is nothing beside the clipmap
   * rebuilding itself. Looking at the sky returns the far end of the march, so the ghost slides out
   * to arm's length instead of vanishing.
   */
  function aimSpot(maxRange = 40) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const from = camera.position;
    let last = { x: control.x, z: control.z };
    for (let t = 1.5; t <= maxRange; t += 1) {
      const x = from.x + dir.x * t;
      const y = from.y + dir.y * t;
      const z = from.z + dir.z * t;
      if (y <= terrain.heightAt(x, z)) return { x, z };
      last = { x, z };
    }
    return last;
  }

  /**
   * What you can pay with, standing where you are.
   *
   * The storage pool at your feet AND the bag on your back, in one object with the `count`/`spend`
   * shape js/shipyard.js's `bagOf` wants. A shipyard bill is large enough that making the player
   * carry it by hand would be a punishment rather than a decision.
   */
  function payBag() {
    const pool = () => stores.poolAt?.(control.x, control.z);
    const count = id => {
      const p = pool();
      return (p ? stores.count(p, id) : 0) + (materials.count?.(id) ?? 0);
    };
    return {
      count,
      /**
       * `canAfford` IS THE HANDLE js/vehicles.js's `bagOf` LOOKS FOR.
       *
       * Anything without it is treated as a plain `{ id: count }` map and read with `held[id]` — so
       * a purse with `count` and `spend` but no `canAfford` came back as completely empty, and the
       * whole shipyard answered "the assembler has not built a Hull Section yet" while ninety of
       * them sat in the crate at the player's feet.
       */
      canAfford: cost => Object.entries(cost || {}).every(([id, n]) => count(id) >= n),
      missing: cost => {
        const out = {};
        for (const [id, n] of Object.entries(cost || {})) { const short = n - count(id); if (short > 0) out[id] = short; }
        return out;
      },
      add: (id, n = 1) => materials.add?.(id, n),
      spend: cost => {
        // check the whole bill before taking any of it, or a short build eats half the materials
        for (const [id, n] of Object.entries(cost || {})) {
          const p = pool();
          if ((p ? stores.count(p, id) : 0) + (materials.count?.(id) ?? 0) < n) return false;
        }
        for (const [id, n] of Object.entries(cost || {})) {
          const p = pool();
          const fromPool = p ? Math.min(n, stores.count(p, id)) : 0;
          if (fromPool > 0) stores.take(p, id, fromPool);
          if (n - fromPool > 0) materials.spend?.({ [id]: n - fromPool });
        }
        return true;
      },
    };
  }

  /** Which benches are within reach, for the recipes and subsystems that need one. */
  function benchesNear(reach = 10) {
    return (build.entries || [])
      .filter(e => works.machineDefs?.[e.key] && Math.hypot(e.x - control.x, e.z - control.z) < reach)
      .map(e => e.key);
  }

  /**
   * Is the ground here flat enough for a launch pad?
   *
   * Sampled rather than assumed: `PAD.maxSlope` is 0.04, which is flatter than anywhere on Farhold
   * is naturally — that is the point, it is what sends the player to the smoothing tool. The
   * terraform wrapper means `heightAt` already answers with the edited ground.
   */
  function padGroundOk() {
    const r = PAD.flatRadius;
    const h0 = terrain.heightAt(control.x, control.z);
    for (let a = 0; a < 8; a++) {
      const th = (a / 8) * Math.PI * 2;
      const h = terrain.heightAt(control.x + Math.cos(th) * r, control.z + Math.sin(th) * r);
      if (Math.abs(h - h0) / r > PAD.maxSlope) return false;
    }
    return true;
  }

  /**
   * Put a finished piece on the grid, in the storage pools, or both.
   *
   * `power.make` is a generator, `power.store` a battery, `power.reach` a pole and `power.use` a
   * machine that draws — the four shapes js/power.js already knows. `store.slots` is a crate. A
   * piece that is none of those (a wall, a statue, a road) joins nothing, which is correct.
   */
  function joinSystems(entry, def) {
    if (!entry || !def) return;
    const power = def.power || null;
    // A REJOIN MUST NOT BE A RESET. `stores.add` and `grid.add` both build a fresh unit and drop
    // the old one, so on a load — where the pools and the grid were restored a moment earlier —
    // calling them again would empty every crate and flatten every battery.
    if (grid.get(entry.id) || stores.get(entry.id) || works.get(entry.id)) return;
    if (power) {
      if (power.make != null || power.store != null || power.reach != null) {
        // a generator, a battery or a pole: the type carries its own numbers in data/power.json
        grid.add({ id: entry.id, type: entry.key, name: entry.name, x: entry.x, z: entry.z });
      } else if (power.use != null) {
        // a machine: it only needs how much it pulls and how early it is shed in a brownout
        grid.add({
          id: entry.id, type: entry.key, name: entry.name, x: entry.x, z: entry.z,
          draw: power.use, priority: def.cat === 'waypoint' ? 'waypoint' : def.cat === 'defence' ? 'defence' : 'refining',
        });
      }
    }
    if (def.store?.slots) {
      stores.add({ id: entry.id, type: entry.key, name: entry.name, x: entry.x, z: entry.z });
    }
    /**
     * …AND A BENCH IS A BENCH.
     *
     * Every one of data/refining.json's sixteen machines has a structure with the SAME id in
     * data/structures.json, so a smelter you build is a smelter js/refine.js can queue work on.
     * Nothing called `works.place` either: you could build the whole refining chain and it would
     * stand there as geometry while the module that runs it had an empty machine list.
     */
    if (works.machineDefs?.[entry.key]) {
      works.place({ id: entry.id, type: entry.key, x: entry.x, z: entry.z, name: entry.name });
    }
  }

  /**
   * CARRY THE GRID'S ANSWER BACK TO THE THINGS THAT CARE.
   *
   * `grid.tick` works out what is lit; nothing was reading the result. So a pad's `powered` flag
   * never moved off whatever js/buildplan.js set it to when it was placed, which for anything with
   * a `power.use` is `false` — the sigils could never light however many generators you built
   * beside them. Run after the grid, once a second rather than every frame: a waypoint that takes
   * a tick to notice the lights came back is fine, sixty needless writes a second is not.
   */
  function syncPower() {
    for (const entry of build.entries || []) {
      const lit = grid.get(entry.id) ? grid.poweredOf(entry.id) > 0 : true;
      if (entry.powered === lit) continue;
      entry.powered = lit;
      if (!entry.waypoint) continue;
      waypoints.setPowered(entry.id, lit);
      homes.setPowered(entry.id, lit);
      hud.log(lit
        ? `The sigils at ${entry.name} come up. You can travel here from anywhere now.`
        : `The sigils at ${entry.name} go dark. Its grid is down.`, lit ? 'level' : 'bad');
    }
  }

  /**
   * Build mode. `B` toggles it; the rest of the keys are listed on screen when it is up.
   *
   * `store` is how a cost is paid: the pool the ghost is standing in first, then the materials bag,
   * so a bench beside a crate builds out of the crate without the player carrying anything.
   */
  const build = createBuild(scene, {
    terrain, terraform, view,
    catalogue: structureData || null,
    plan: null,
    spellfx,
    /**
     * THE POOL YOU ARE STANDING IN, THEN THE BAG ON YOUR BACK.
     *
     * js/stores.js addresses a POOL, not a position — `count(pool, res)` — so the pool has to be
     * looked up first. I had these three calling `count(id, x, z)`, which passed the resource id as
     * the pool and the player's x as the resource: a crate at your feet paid for nothing, every
     * cost came out of the bag, and the whole storage-pool layer was decorative. `poolAt` returns
     * null when there is nothing near, and then the bag is the only answer anyway.
     *
     * The sum is deliberate: a bench beside a half-full crate builds out of BOTH rather than
     * refusing because neither holds the whole cost on its own.
     */
    store: {
      have: id => {
        const pool = stores.poolAt?.(control.x, control.z);
        return (pool ? stores.count(pool, id) : 0) + (materials.count?.(id) ?? 0);
      },
      take: (id, n) => {
        const pool = stores.poolAt?.(control.x, control.z);
        const fromPool = pool ? Math.min(n, stores.count(pool, id)) : 0;
        if (fromPool > 0) stores.take(pool, id, fromPool);
        const rest = n - fromPool;
        if (rest > 0) materials.spend?.({ [id]: rest });
        return n;
      },
      // a refund goes back into the pool if there is one, because that is where the next build
      // will look for it — putting it in the bag means carrying it back to the crate by hand
      give: (id, n) => {
        const pool = stores.poolAt?.(control.x, control.z);
        // `put` returns how many actually FITTED — the caps in js/stores.js mean a full crate takes
        // some of a refund and not all of it — so whatever it would not take goes in the bag
        const stored = pool ? stores.put(pool, id, n) : 0;
        if (n - stored > 0) materials.add?.(id, n - stored);
        return n;
      },
    },
    onLog: (t, c) => hud.log(t, c),
    onClear: (x, z, r) => props.clearAround?.(x, z, r) || { removed: 0, materials: {} },
    /**
     * A WAYPOINT PAD JOINS THE NETWORK THE MOMENT IT IS FINISHED.
     *
     * Two registers, on purpose: `waypoints` so the map on THIS world draws it beside the towns,
     * and `homes` so it is still there after you fold to another star. The pad is filed under the
     * world it stands on, which is why both calls happen here rather than inside build.js — that
     * file has no idea what system it is in and should not learn.
     */
    /**
     * A PIECE HAS TO JOIN THE SYSTEMS THAT MAKE IT WORK.
     *
     * The grid, the storage pools and the waypoint network are all built above and every one of
     * them was empty: nothing ever called `grid.add` or `stores.add`, so a generator you built
     * generated nothing, a crate held nothing, and the pad you paid four crystal for stayed dark
     * for ever. The catalogue already says which is which — `power.make`, `power.use`,
     * `store.slots` — and the ids in data/structures.json match data/power.json exactly, so the
     * join is this and nothing more.
     */
    onPlace: (entry, def) => {
      joinSystems(entry, def);
      /**
       * A DRILL PUT DOWN ON A SEAM STARTS WORKING IT.
       *
       * The catalogue calls it `drill`; js/resources.js knows what is under it. Refused out loud
       * rather than silently, because a drill is an expensive thing to put in the wrong place and
       * "nothing happened" is the worst possible answer to having done so.
       */
      if (entry.key === 'drill' || entry.key === 'pump') {
        const seam = ore.at(entry.x, entry.z, 6);
        const got = mining.bindDrill(entry, seam);
        hud.log(got.ok
          ? `${entry.name} bites into the ${(resourceData?.materials?.[seam.resource]?.name || seam.resource).toLowerCase()}. It needs power, and a route to somewhere to put it.`
          : got.why, got.ok ? 'good' : 'warn');
      }
      if (!entry?.waypoint) return;
      const name = `${planet?.name || 'This world'} — ${entry.claim || 'base'}`;
      waypoints.addBuilt({ id: entry.id, name, x: entry.x, z: entry.z, claim: entry.claim, powered: !!entry.powered });
      homes.add({
        id: entry.id, name, x: entry.x, z: entry.z, claim: entry.claim, powered: !!entry.powered,
        starId, systemSeed, starName: star?.name || '',
        planetId: planet?.id ?? null, planetName: planet?.name || '',
        founded: Math.round(state.elapsed || 0),
      });
      hud.log(`${name} is on the waypoint network. You can travel back to it from anywhere.`, 'level');
    },
    /**
     * The route tool's two ends: a drill, and somewhere to put what it digs.
     *
     * js/build.js picks the objects; the rate is entirely js/mining.js's business, which is why it
     * comes back through here as a callback rather than build mode learning about storage pools.
     */
    onRoute: (from, to) => {
      const pool = stores.poolAt(to.x, to.z);
      if (!pool) return { ok: false, why: `${to.name} is not a store. A route ends somewhere that holds things.` };
      return mining.route(from.id, pool.id);
    },
    onRemove: entry => {
      grid.remove(entry.id);
      stores.remove(entry.id);
      works.remove(entry.id);
      mining.unbindDrill(entry.id);
      if (!entry?.waypoint) return;
      waypoints.removeBuilt(entry.id);
      homes.remove(entry.id);
    },
  });
  /**
   * The panel that answers the question. B puts it up with the ghost.
   *
   * It is handed the SAME `store.have` build mode pays out of, so a price it shows is a price the
   * placement will agree with — the one thing a build interface must never get wrong.
   */
  /**
   * §9 — the shipyard's four actions, and the state behind the screen that offers them.
   *
   * A named object rather than an inline one so the tests and the debug menu press exactly the
   * buttons the panel presses. Everything is computed here rather than in js/build-ui.js because
   * every one of these questions needs the world: which bench you are at, what the pool beside you
   * holds, whether the ground under the pad is actually flat.
   */
  const shipyardActions = {
    state: () => {
      const y = shipYard(player);
      const here = (build.entries || [])
        .filter(e => e.key === 'assembler')
        .some(e => Math.hypot(e.x - control.x, e.z - control.z) < 10);
      const purse = payBag();
      const stations = benchesNear();
      const parts = PART_IDS.map(id => {
        const sub = SUBSYSTEMS[id];
        const next = partCost(player, id);
        const can = canBuildPart(player, id, purse, { stations });
        return {
          id, name: sub.name,
          done: (y.built[id] || 0) > 0,
          tier: y.built[id] || 0,
          ok: can.ok, why: can.ok ? '' : can.why,
          costText: next ? Object.entries(next.cost).map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`).join(', ') : 'finished',
        };
      });
      const ready = shipReady(player, 'lander');
      const flat = padGroundOk();
      const padPowered = !!(build.entries || []).some(e => e.powered && grid.get(e.id));
      const padCan = !y.pad
        ? (!flat ? { ok: false, why: `The pad wants ${PAD.flatRadius} m of level ground. Use the Level tool.` }
          : !padPowered ? { ok: false, why: `The pad draws ${PAD.power} kW. Get a generator to it first.` }
          : { ok: true, why: Object.entries(PAD.cost).map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`).join(', ') })
        : { ok: false, why: 'Built.' };
      const fuelHave = purse.count(FUEL.id);
      return {
        atAssembler: here,
        started: !!y.pad || PART_IDS.some(id => (y.built[id] || 0) > 0) || (player.vehicles?.owned?.ship || []).length > 0,
        summary: (player.vehicles?.owned?.ship || []).length
          ? `${SHIPS[player.vehicles.active?.ship]?.key || 'ship'} · tanks ${y.fuel.toFixed(1)}/${FUEL.capacity}`
          : 'Four subsystems, a pad, and a tank of fuel.',
        pad: !!y.pad, padOk: padCan.ok, padWhy: padCan.why,
        parts,
        assembleOk: ready.ok,
        assembleWhy: ready.ok ? '' : ready.why,
        fuelOk: fuelHave > 0 && y.fuel < FUEL.capacity,
        fuelText: fuelHave > 0
          ? `${Math.min(fuelHave, FUEL.capacity - y.fuel).toFixed(1)} to hand · tanks ${y.fuel.toFixed(1)}/${FUEL.capacity}`
          : `No lift fuel. A fuel synthesiser makes it. Tanks ${y.fuel.toFixed(1)}/${FUEL.capacity}`,
      };
    },
    buildPad: () => {
      const out = buildLaunchPad(player, payBag(), { stations: benchesNear(), flat: padGroundOk(), powered: true });
      hud.log(out.ok ? 'The pad is laid. A ship can put down here now.' : out.why, out.ok ? 'level' : 'bad');
      return out;
    },
    buildPart: id => {
      const out = buildPart(player, id, payBag(), { stations: benchesNear() });
      hud.log(out.ok ? `${out.name || SUBSYSTEMS[id].name} fitted.` : out.why, out.ok ? 'good' : 'bad');
      return out;
    },
    assemble: () => {
      const out = assembleShip(player, 'lander', payBag());
      hud.log(out.ok ? `${out.name} stands on the pad. Fill the tanks and J takes you up.` : out.why, out.ok ? 'level' : 'bad');
      if (out.ok) autoSave();
      return out;
    },
    refuel: () => {
      const out = refuel(player, payBag());
      hud.log(out.ok ? `${out.added.toFixed(1)} lift fuel aboard. Tanks at ${out.fuel.toFixed(1)}.` : out.why, out.ok ? 'good' : 'bad');
      return out;
    },
  };

  const buildUI = createBuildUI({
    catalogue: structureData || null,
    build,
    store: { have: id => {
      const pool = stores.poolAt?.(control.x, control.z);
      return (pool ? stores.count(pool, id) : 0) + (materials.count?.(id) ?? 0);
    } },
    onLog: (t, c) => hud.log(t, c),
    mining,
    works,
    // the bench you are standing next to — a base ends up with sixteen and listing them all turns
    // the panel into a spreadsheet
    shipyard: shipyardActions,
    /**
     * §6.3 — the motorcycle, the car and the truck. Built at a bench, ridden with G.
     *
     * Only shown once you are standing at a bench that could make one, because a vehicle has no
     * footprint and cannot go in the catalogue list with everything that does.
     */
    /**
     * §6.5 / §6.8 / §6.9 — the people who live here, their fields, and the tax.
     *
     * js/colony.js and js/farm.js were both complete, both ticking, and both invisible: there was no
     * way to see a citizen, accept a migrant, break a field or collect a penny.
     */
    holding: {
      state: () => {
        const beds = (build.entries || []).filter(e => e.key === 'bed').length;
        const cit = colony.citizens?.length ?? 0;
        if (!beds && !cit) return { show: false };
        const a = colony.appeal?.() || { score: 0 };
        const crop = farm.report?.() || { plots: 0, ripe: 0, meals: 0 };
        const taxable = colony.housed?.() ?? 0;
        return {
          show: true,
          summary: `${cit} of ${beds} beds · appeal ${Math.round(a.score * 100)}% · `
            + `${crop.plots} field${crop.plots === 1 ? '' : 's'}${crop.ripe ? `, ${crop.ripe} ripe` : ''} · ${crop.meals} meals`,
          offers: (colony.pending || []).map(o => ({ id: o.id, name: o.name, job: o.job })),
          taxOk: taxable > 0,
          taxNote: taxable > 0
            ? `${taxable} housed · prosperity ${colony.prosperity().toFixed(2)}`
            : cit ? 'Nobody is housed. A citizen with no bed pays nothing.' : 'Nobody lives here yet.',
          fieldOk: true,
          fieldNote: `${crop.plots} broken · they will replant what you start, never start their own`,
        };
      },
      accept: id => {
        const out = colony.accept?.(id);
        hud.log(out?.ok ? `${out.citizen.name} moves in.` : (out?.why || 'They did not stay.'), out?.ok ? 'level' : '');
      },
      turnAway: id => { colony.turnAway?.(id); hud.log('You send them on their way.', ''); },
      tax: () => {
        const out = colony.collectTax?.();
        if (!out) return;
        player.gold += out.gold;
        hud.log(out.gold > 0
          ? `${out.gold} gold in tax from ${out.paid.length}.${out.skipped.length ? ` ${out.skipped.length} paid nothing.` : ''}`
          : 'Nobody had anything to give.', out.gold > 0 ? 'good' : 'warn');
      },
      field: () => {
        const out = farm.layPlot?.({
          x: control.x, z: control.z, by: 'player',
          biome: terrain.biomeAt(control.x, control.z).key,
          at: state.elapsed / 3600,
        });
        hud.log(out?.ok ? `A field of ${out.plot.crop}. Your folk will work it once it is going.` : (out?.why || 'Not here.'),
          out?.ok ? 'good' : 'warn');
      },
    },
    garage: {
      list: () => {
        const stations = benchesNear();
        if (!stations.length) return [];
        const purse = payBag();
        return GROUND_LADDER.map(key => {
          const spec = GROUND_VEHICLES[key];
          const owned = (player.vehicles?.owned?.ground || []).includes(key);
          const can = canBuildVehicle(player, key, purse, { stations });
          const rigNow = player.vehicles?.rigs?.[key] || { fuel: 0, condition: 100 };
          const fuelHave = purse.count(GROUND_FUEL.id);
          return {
            key, name: spec.name, owned,
            ok: can.ok, fuelOk: owned && fuelHave > 0 && rigNow.fuel < spec.tank,
            note: owned
              ? `tank ${rigNow.fuel.toFixed(1)}/${spec.tank} · ${Math.round(rigNow.condition)}% · ${Math.round(rangeLeft(player, key))} m left`
              // the cost lives under `craft`, beside the stations that can do the work
              : can.ok ? Object.entries(spec.craft?.cost || {}).map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`).join(', ') : can.why,
          };
        }).filter(v => v.owned || v.ok || GROUND_LADDER.indexOf(v.key) === 0 || (player.vehicles?.owned?.ground || []).length);
      },
      build: key => {
        const out = buildVehicle(player, key, payBag(), { stations: benchesNear() });
        hud.log(out.ok ? `${GROUND_VEHICLES[key].name} built. G gets on it.` : out.why, out.ok ? 'level' : 'bad');
        if (out.ok) autoSave();
        return out;
      },
      refuel: key => {
        const out = refuelVehicle(player, key, payBag());
        hud.log(out.ok ? `${out.added?.toFixed?.(1) ?? ''} ${GROUND_FUEL.name} in the tank.` : out.why, out.ok ? 'good' : 'bad');
        return out;
      },
    },
    nearest: () => (build.entries || [])
      .filter(e => works.machineDefs?.[e.key])
      .map(e => ({ e, away: Math.hypot(e.x - control.x, e.z - control.z) }))
      .filter(r => r.away < 8)
      .sort((a, b) => a.away - b.away)[0]?.e || null,
  });
  document.body.append(buildUI.root);

  /**
   * The mouse, in build mode. Registered HERE rather than beside `createInput`, because `build` is
   * a `const` declared further down and a click during the load would have hit it before it exists.
   *
   * A click counter rather than a flag: a player putting a line of fence posts down clicks faster
   * than the frame rate on a bad frame, and a dropped post feels like the game ignoring you.
   */
  renderer.domElement.addEventListener('mousedown', e => {
    if (!build.mode || e.button !== 0) return;
    buildClicks++;
  });
  renderer.domElement.addEventListener('wheel', e => {
    if (!build.mode) return;
    e.preventDefault();
    // the terrain tools have no ghost to turn, so the wheel sizes the brush for them instead
    if (build.tool === 'build') build.rotate(Math.sign(e.deltaY) * (Math.PI / 8));
    else build.setRadius(build.radius - Math.sign(e.deltaY) * 2);
  }, { passive: false });

  if (save?.build) {
    build.load?.(save.build);
    // the drills and their routes, now that the pieces they hang off are back
    if (save.mining) mining.load(save.mining, id => (build.entries || []).find(e => e.id === id) || null);
    // …and everything that came back joins the grid and the pools again, or a reloaded base is a
    // field of dead machinery beside a dark pad
    for (const entry of build.entries || []) {
      joinSystems(entry, build.defOf(entry.key));
      if (entry.waypoint) {
        waypoints.addBuilt({ id: entry.id, name: entry.name, x: entry.x, z: entry.z, claim: entry.claim, powered: !!entry.powered });
      }
    }
  }

  // an old save keeps the ship it already has — the gate only applies to a fresh start
  migrateShipyard(player);
  /**
   * `?ship=1` starts with one.
   *
   * The gate is §9's whole point and stays real in ordinary play. This exists for the flight tests,
   * which are about how the drive handles and should not have to mine ore first, and for anybody
   * who wants to look at space without earning it.
   */
  if (params.get('ship') === '1') grantShip(player);

  sites.setChests?.(chests);

  /** Fill a camp or a lair with what lives there. Called once per site as you come near it. */
  /**
   * Fill a stronghold with what lives there. Called once per site as you come near it.
   *
   * The body of this used to live here: a champion, four or five of whatever the biome has, and a
   * coin-flip between an iron and a gilded chest, for every site in the game whether it was a bandit
   * camp or a castle. `js/sites.js` knows far more than that now — each of the eight stronghold types
   * declares its own garrison, a named boss with an epithet, prisoners, and a chest grade that climbs
   * with the tier — so the work belongs there and this hands it the things only main.js has: the
   * enemy field, the chest pool, and the namer.
   *
   * A lair keeps its own path, because a lair is one boss and nothing else, and `bossUnit` is what
   * the rest of the file watches to know the world boss is up.
   */
  async function populateSite(site) {
    const level = site.level || player.level;
    if (site.kind === 'lair') {
      const bossDef = field.bossFor(level, site.x, site.z) || (bestiary.bosses || [])[0];
      if (!bossDef) return;
      const unit = await field.placeBoss(bossDef, level, site.x, site.z);
      if (unit) {
        bossUnit = unit;
        hud.log(`${unit.name} keeps this place.`, 'bad');
        sound.combat('death', { beast: true });
      }
      return;
    }
    const filled = await sites.populate(site, {
      field, chests, level,
      nameFor: nameRare,
    });

    /**
     * PRISONERS ARE PEOPLE, NOT A COUNTER.
     *
     * `sites.populate` has returned a prisoner count since the strongholds landed and nothing did
     * anything with it — so a site whose whole point was that somebody was being held in it played
     * out exactly like one that was not. They stand in the middle of the camp, they have names and
     * faces, and `E` talks to them the same as anybody else. What frees them is the boss going
     * down, which is checked in `creditKill`.
     */
    const held = filled?.prisoners || 0;
    if (held > 0) {
      site.heldFolk = [];
      for (let i = 0; i < held; i++) {
        const a = (i / held) * Math.PI * 2;
        const who = await folk.spawnOne({
          groupId: `prisoner:${site.id}`,
          role: 'villager',
          roleName: 'prisoner',
          x: site.x + Math.cos(a) * 3.4,
          z: site.z + Math.sin(a) * 3.4,
          greeting: 'Keep your voice down. Kill the one in charge and we can all walk out of here.',
          seed,
        });
        if (who) { who.captive = true; site.heldFolk.push(who); }
      }
      site.bossUnit = filled?.boss || null;
      if (site.heldFolk.length) {
        hud.log(`Somebody is being held in ${site.name}. ${site.heldFolk.length === 1 ? 'One of them.' : `${site.heldFolk.length} of them.`}`, 'bad');
      }
    }
  }

  /**
   * THE ONE IN CHARGE IS DOWN, SO THE PEOPLE IN THE CELLS WALK OUT.
   *
   * Hung off the BOSS rather than off `creditKill`, and that is not a detail. There are two site
   * lists: `holdings.sitesIn` is the territory record (who holds what, a few hundred bytes in the
   * save) and `js/sites.js` is the physical set piece standing on the ground. They describe the
   * same places and do NOT share coordinates, so a clear credited against one never reaches the
   * other. The boss is a thing that exists in the world, which makes it the honest hook — and it
   * is also exactly what the prisoners themselves tell you to do.
   */
  function freePrisonersOf(unit) {
    if (!unit) return;
    const site = (sites.sites || []).find(s => (s.heldFolk || []).length && s.bossUnit === unit);
    if (!site) return;
    const freed = site.heldFolk;
    site.heldFolk = [];
    for (const who of freed) {
      who.captive = false;
      who.roleName = 'freed';
      who.greeting = 'You came. I had stopped expecting anybody.';
    }
    player.freed = (player.freed || 0) + freed.length;
    rpg.gainXp(player, 40 * freed.length * player.level);
    hud.log(freed.length === 1
      ? `${freed[0].name} walks out of ${site.name} behind you.`
      : `${freed.length} walk out of ${site.name} behind you.`, 'level');
    sound.questDone();

    // the rest of what the stronghold pays, which nothing read either — see BUILD-MODE.md §19
    const pays = site.gives || site.spec?.gives || {};
    if (pays.xp) rpg.gainXp(player, Math.round(pays.xp * (1 + (player.level - 1) * 0.15)));
    if (pays.loot) {
      chests.place(pays.loot === 'legendary' ? 'gilded' : 'iron', site.x + 2, site.z + 2,
        { level: player.level, floor: pays.loot, name: `${site.name}: the spoils` });
      hud.log(`Something ${pays.loot} is in there.`, 'loot');
    }
    if (pays.perkPoint) {
      player.bonusPerks = (player.bonusPerks || 0) + pays.perkPoint;
      hud.log(`A perk point for taking ${site.name}.`, 'level');
    }
    if (pays.standing) standings.deed(pays.standing, 'stronghold_taken');
    const here = zones.at(site.x, site.z);
    if (pays.revealZone && here) { map.revealZone?.(here.id); hud.log(`${here.name} goes on your chart.`, 'good'); }
    if (pays.opensDungeon) hud.log('Behind the keep, a stair goes down. It was not there before.', 'loot');
    if (pays.liftsSiege && here) {
      holdings.press?.(here.id, 0.18, { claim: 0.1 });
      hud.log(`The siege on ${here.name} lifts.`, 'level');
    }
    if (here) rumours.add(`somebody got ${freed.length === 1 ? 'a prisoner' : 'prisoners'} out of ${site.name}`,
      { zone: here, from: 'one of them' });
    hud.setPlayer(player);
    autoSave();
  }

  // ---------------------------------------------------------------- dungeons
  //
  // Going inside swaps the FLOOR — the controller, the enemy field and the companions all read
  // their terrain through a binding for exactly this — hides the surface, and turns the lights out.
  // Coming back out puts everything where it was.
  let dungeon = null;
  let bossUnit = null;
  /** The last thing the quest helper said, so it does not say it sixty times a second. */
  let lastHelper = null;

  /**
   * GROUND THAT KEEPS BURNING — the `linger` talent, which had nothing to land in.
   *
   * `js/skilltalents.js` has listed `ground` and `groundRadius` under PENDING_MODS since round 7
   * with the note "no lingering ground pool exists", and the talent is offered on four of the six
   * skill trees. Taking it did nothing whatsoever.
   *
   * A pool is four numbers and a ring. It ticks on a CLOCK rather than per frame — a pool paying
   * `perSecond * dt` sixty times a second reads as "1 damage" however correct the total, which is
   * the same trap the DoTs fell into in round 6 and is written up in RPG.md.
   */
  const pools = [];
  /**
   * The disc on the floor. Drawn here rather than through spellfx because spellfx has no ground
   * effect — and a pool you cannot see is precisely the failure this whole round was about.
   */
  const POOL_TINT = {
    fire: '#ff7a3a', frost: '#8fd6ff', shock: '#ffe86a', poison: '#9ede6a',
    shadow: '#c090ff', holy: '#ffe6a8', nature: '#8ad66a', arcane: '#b79cf5', physical: '#d8dcea',
  };
  function dropPool({ x, z, r, seconds, element = 'physical', power = 0.5 }) {
    const geo = new THREE.CircleGeometry(r, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(POOL_TINT[element] || POOL_TINT.physical),
      transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    // a hand's breadth above the ground so it does not fight the terrain for the same pixels
    ring.position.set(x, terrain.heightAt(x, z) + 0.08, z);
    scene.add(ring);
    pools.push({ x, z, r, left: seconds, life: seconds, every: 0.75, next: 0.75, element, power, ring });
    return pools[pools.length - 1];
  }
  function tickPools(dt) {
    for (let i = pools.length - 1; i >= 0; i--) {
      const p = pools[i];
      p.left -= dt;
      p.next -= dt;
      if (p.next <= 0) {
        p.next = p.every;
        const hits = field.strikeArea(p.x, p.z, p.r, player, { falloff: 0.2, element: p.element, power: p.power });
        for (const h of hits) brandHit(h.enemy, h.result);
      }
      // it fades as it burns out, so you can see how long you have left to stand clear of it
      if (p.ring) p.ring.material.opacity = 0.32 * Math.max(0, p.left / p.life);
      if (p.left <= 0) {
        if (p.ring) {
          scene.remove(p.ring);
          p.ring.geometry.dispose();
          p.ring.material.dispose();
        }
        pools.splice(i, 1);
      }
    }
  }
  let surfaceSpot = null;
  let dungeonsCleared = new Set(save?.dungeonsCleared || []);

  function surfaceVisible(on) {
    view.setVisible?.(on);
    props.setVisible?.(on);
    features.setVisible?.(on);
    weatherView.setVisible?.(on);
    chests.clear();
    gates.mesh.visible = on;
  }

  async function enterDungeon(node) {
    if (dungeon) return;
    const level = Math.max(1, (node.zone?.midLevel ?? player.level) + 1);
    hud.log(`You go down into ${node.name}.`, 'level');
    state.paused = true;
    surfaceSpot = { x: control.x, z: control.z };
    field.clear();

    const families = familiesOf(terrain.biomeIdAt(node.x, node.z));
    dungeon = await createDungeon(scene, {
      seed: (seed * 31 + node.id) >>> 0, balance, node, level, rpg,
      look: lookForBiome(families), name: node.name,
      surface: { ...terrain, spawn: { x: node.x, z: node.z } },
    });

    surfaceVisible(false);
    control.setTerrain(dungeon.terrain, dungeon.entryPoint());
    control.obstacles = [dungeon.solids];
    field.terrain = dungeon.terrain;
    field.solids = [dungeon.solids];
    field.rankBonus = 1.7;                     // more champions and rares than out in the open
    pets.setTerrain(dungeon.terrain);
    chests = dungeon.chests;

    // a pack in every room but the one you came in by, and the boss at the far end
    const packs = balance.dungeon?.packsPerRoom || [1, 3];
    for (const room of dungeon.rooms) {
      if (room.kind === 'entrance') continue;
      if (room.kind === 'boss') continue;
      const want = packs[0] + Math.floor(field.rng() * (packs[1] - packs[0] + 1));
      for (let i = 0; i < want; i++) {
        const pool = field.defsFor(node.x, node.z, level);
        if (!pool.length) break;
        const def = field.rng.pick(pool);
        const rank = field.rpg.rollRank(field.rng, { bonus: field.rankBonus });
        const x = room.x + (field.rng() - 0.5) * (room.w - 3);
        const z = room.z + (field.rng() - 0.5) * (room.h - 3);
        field.addRanked(def, level, x, z, rank);
      }
    }
    if (dungeon.bossRoom !== dungeon.entrance) {
      const bossDef = field.bossFor(level, node.x, node.z) || (bestiary.bosses || [])[0];
      if (bossDef) {
        bossUnit = await field.placeBoss(bossDef, level, dungeon.bossRoom.x, dungeon.bossRoom.z);
      }
    }
    field.paused = true;                        // nothing wanders in from outside: this is a closed place
    light.setTorch(true);
    scene.fog.near = 2; scene.fog.far = 70;
    scene.fog.color.set(dungeon.look.fog);
    node.entered = true;
    state.paused = false;
    hud.log('It is very dark. Your torch is lit.', '');
    autoSave();
  }

  function leaveDungeon() {
    if (!dungeon) return;
    field.clear();
    bossUnit = null;
    hud.boss(null);
    dungeon.dispose();
    dungeon = null;
    field.terrain = terrain;
    field.solids = [props.solids, features.solids];
    field.rankBonus = 1;
    field.paused = false;
    pets.setTerrain(terrain);
    chests = createChests(scene, terrain, { seed, balance, zones, rpg, collide: props.solids });
    control.setTerrain(terrain, surfaceSpot ? { ...surfaceSpot, y: null } : null);
    control.obstacles = [props.solids, features.solids];
    surfaceVisible(true);
    rebuildWorldAround(true);
    hud.log('Daylight, or what passes for it.', 'good');
    autoSave();
  }

  /** The boss of the dungeon you are standing in went down. Pay for it. */
  function onDungeonBossDown() {
    if (!dungeon) return;
    const node = gates.nodes.find(g => g.name === dungeon.name);
    if (node) node.cleared = true;
    dungeonsCleared.add(dungeon.name);
    const cfg = balance.dungeon || {};
    const goldSpan = cfg.clearRewardGold || [80, 240];
    const gold = Math.round(goldSpan[0] + field.rng() * (goldSpan[1] - goldSpan[0]) * (1 + dungeon.level * 0.1));
    const wantSpan = cfg.clearRewardItems || [1, 3];
    const want = wantSpan[0] + Math.floor(field.rng() * (wantSpan[1] - wantSpan[0] + 1));
    const items = [];
    for (let i = 0; i < want; i++) {
      const it = rpg.rollDrop({ level: dungeon.level, rng: rpg.rng, magicFind: player.derived.magicFind, chance: 1, rarityBoost: 2, floor: i === 0 ? 'rare' : null });
      if (it) items.push(it);
    }
    const mats = { dust: 2 + Math.floor(field.rng() * 3), core: 1 };
    takeHaul({ items, gold, mats });
    campaign.onKill('dungeon_cleared');
    for (const q of questLog.onClear?.({ name: dungeon.name }) || []) hud.log(`${q.title}: cleared.`, 'good');
    sound.questDone();
    rewards({
      title: 'Dungeon cleared', subtitle: `${dungeon.name} is quiet now.`,
      gold, xp: 0, items: items.map(rewardItem),
      extras: [{ kind: 'quest', text: `${Object.entries(mats).map(([k, v]) => `${v} ${craft.M[k]?.name || k}`).join(', ')} recovered` }],
      button: 'Take it',
    });
  }

  /**
   * `E` in the world: open a chest, go into a dungeon, come back out, or talk to somebody. One key,
   * and the prompt above the hint bar always says which of those it is about to do.
   */
  function interactTarget() {
    if (dungeon) {
      const exit = dungeon.exitPoint();
      if (Math.hypot(control.x - exit.x, control.z - exit.z) < 4) return { kind: 'leave' };
    }
    const chest = chests.nearest(control.x, control.z);
    if (chest) return { kind: 'chest', chest };
    if (!dungeon) {
      const gate = gates.nearest(control.x, control.z);
      if (gate) return { kind: 'dungeon', gate };
      const who = folk.nearest(control.x, control.z);
      if (who) return { kind: 'talk', who };
      // 6 m on a 57 km world meant you only met somebody by walking over the exact spot
      const met = roadFolk.near(control.x, control.z, 22)[0];
      if (met) return { kind: 'wanderer', met };
      const mark = hud.here && holdings.landmarksIn(hud.here.id)
        .find(l => l.state !== 'done' && Math.hypot(l.x - control.x, l.z - control.z) < 14);
      if (mark) return { kind: 'landmark', mark };

      /**
       * …and a landmark you can SEE, not only one the territory layer knows about.
       *
       * `landmarksIn` lists what the zone record holds. The set pieces standing on the ground come
       * from `js/sites.js`, and nothing joined the two up — so you could walk to a ring of standing
       * stones, look straight at it, press E, and be told there is nothing here. Every landmark site
       * is shaped with the `cell`/`steps`/`gives` fields `atLandmark` reads, so it can be handed
       * straight in.
       */
      const seen = sites.nearest?.(control.x, control.z, 18);
      if (seen && seen.family === 'landmark') return { kind: 'landmark', mark: seen };

      /**
       * THE NOTICE BOARD — where work comes from now, and it is a THING you walk up to.
       *
       * "Under your journal you can accept quests arbitrarily from the menu... Players should look
       * for towns to pick up quests." The Journal lists what you know and takes nothing; a town has
       * a board, and this is how you reach it.
       *
       * The first version tested `features.settlementAt()`, which is the whole settlement — so "E to
       * read the notice board" followed the player around the entire town and sat on top of every
       * other thing they might have wanted to press E on. It is a real object at a real spot now,
       * and you have to be next to it.
       */
      // a portal mouth, either end of it
      const end = portals.endAt?.(control.x, control.z, planet?.name || null);
      if (end) return { kind: 'portal', end };

      const inTown = features.settlementAt(control.x, control.z);
      if (inTown) {
        const board = boardSpotFor(inTown, (x, z) => !terrain.waterAt(x, z) && !terrain.underwater(x, z)
          && terrain.riverAt(x, z) <= 0.3 && terrain.slopeAt(x, z, 4) <= 0.5);
        if (Math.hypot(control.x - board.x, control.z - board.z) < 5) return { kind: 'board', town: inTown };
      }

      /**
       * A SEAM UNDER YOUR FEET. Last, because everything above is rarer and more interesting.
       *
       * Ore is the one thing on this list there is a lot of, so it must never be what E finds when
       * you meant the chest, the person or the door standing in the same few metres.
       */
      /**
       * THE ALARM BELL — §7's whole design in one object.
       *
       * The raid does not arrive; you ring for it. Before that it is an offer you have taken and
       * nothing at all is happening, which is the difference between a quest and a tax on building.
       */
      const bell = (build.entries || [])
        .find(e => e.key === 'alarm_bell' && Math.hypot(e.x - control.x, e.z - control.z) < 4);
      if (bell) return { kind: 'bell', bell };

      const seam = ore.at(control.x, control.z, 4);
      if (seam) return { kind: 'seam', seam };
    }
    return null;
  }

  /**
   * Somebody on the road.
   *
   * A wanderer is one encounter, not a shop you can come back to, so it resolves in a line or two
   * rather than a panel: they say their piece and the one thing they are there for happens. That is
   * deliberate — the notice board is in a town, and this is how a job reaches you when you are not.
   */
  function meetOnTheRoad(met) {
    const out = roadFolk.talk(met.id);
    if (!out) return;
    const { wanderer: w, line } = out;
    sound.ui('open');
    hud.log(`${w.name}, ${w.kindName.toLowerCase()}: "${line}"`, 'good');
    const here = zones.at(control.x, control.z);

    switch (w.gives) {
      case 'rumour':
      case 'board': {
        const elsewhere = zones.list().filter(z => z.id !== here?.id);
        const pick = elsewhere[Math.floor(Math.random() * elsewhere.length)];
        const heard = pick && rumours.hear(pick, { from: `${w.name}, on the road`, extra: { unvisitedLandmarks: 2 } });
        hud.log(heard ? `${w.name} says ${heard.text}.` : `${w.name} has nothing new to tell you.`);
        roadFolk.settle(w.id, 'helped');
        break;
      }
      case 'job': {
        const job = localBoard.find(j => !j.taken && (!w.job || j.frame === w.job)) || localBoard.find(j => !j.taken);
        if (job) { hud.onTakeJob?.(job); } else hud.log(`${w.name} has no work for you.`);
        roadFolk.settle(w.id, 'helped');
        break;
      }
      case 'buff': {
        const b = w.buff || { stat: 'regen', amount: 2, minutes: 20 };
        hud.log(`${w.name} does you a kindness. It will wear off.`, 'level');
        rpg.fx?.grant?.(player, b) ?? (player.hp = Math.min(player.derived.maxHp, player.hp + 30));
        roadFolk.settle(w.id, 'helped');
        break;
      }
      case 'passage': {
        const toll = earnedRewards().freeTolls ? 0 : (w.toll || 6);
        if (!toll) {
          hud.log(`${w.name} knows your face and lifts the chain without asking.`, 'good');
          roadFolk.settle(w.id, 'paid');
          break;
        }
        if (player.gold >= toll) {
          player.gold -= toll;
          hud.log(`You pay ${toll}. ${w.name} lifts the chain.`);
          roadFolk.settle(w.id, 'paid');
        } else hud.log(`${w.name} wants ${toll} and you have ${player.gold}.`, 'bad');
        break;
      }
      case 'standing': {
        const cut = Math.round(player.gold * (w.cutShare || 0.1));
        if (cut > 0 && player.gold >= cut) {
          player.gold -= cut;
          standings.deed(w.faction || 'wardens_reach', 'toll_paid');
          hud.log(`You hand over ${cut}. The ledger closes.`);
          roadFolk.settle(w.id, 'paid');
        } else { hud.log(`${w.name} looks at your purse and waves you on.`); roadFolk.settle(w.id, 'paid'); }
        break;
      }
      case 'cache': {
        const gold = 40 + Math.round(Math.random() * 60 * player.level);
        player.gold += gold;
        hud.log(`${w.name} points, and there is ${gold} gold where they pointed.`, 'good');
        roadFolk.settle(w.id, 'helped');
        break;
      }
      case 'shop': {
        const spec = w.stock || { count: 2, rarity: 'magic' };
        for (let i = 0; i < spec.count; i++) {
          const item = attuneWeapon(rpg.loot.generate(null, spec.rarity, 'low', { rng: rpg.rng, level: player.level }));
          if (item) player.bag.push(item);
        }
        hud.log(`${w.name} sells you ${spec.count} things off their own back.`, 'good');
        roadFolk.settle(w.id, w.angers ? 'helped' : 'paid');
        break;
      }
      case 'hire': {
        /**
         * AN OFFER, NOT A TRANSACTION.
         *
         * "I found a mercenary in town who joined me but it should have opened a dialog where they
         * offered to join me and I was able to accept/deny. I had no idea it would just straight up
         * hire them." It took the gold and summoned in the same frame, so meeting one on the road
         * was indistinguishable from being robbed. `folk.hireOffer` builds the card — who they are,
         * what they cost, what they bring — and nothing is spent until it is accepted.
         */
        const pet = (bestiary.pets || []).find(x => x.id === 'sellsword') || null;
        talk.showOffer(folk.hireOffer(w, { level: player.level, gold: player.gold, pet }), {
          accept: () => {
            const price = w.hire?.gold ?? 180;
            if (player.gold < price) { hud.log(`${w.name} wants ${price} up front, and you have ${player.gold}.`, 'bad'); return; }
            player.gold -= price;
            // A hired sword is a real companion, not a line of text — `sellsword` is the one humanoid
            // in the pet table, added for exactly this.
            pets.summon('sellsword', control, { count: 1 }).then(made => {
              for (const one of made || []) one.name = w.name;
              hud.setPlayer(player);
            }).catch(() => {});
            hud.log(`${w.name} takes your ${price} and falls in beside you.`, 'good');
            roadFolk.settle(w.id, 'paid');
            autoSave();
          },
          decline: () => {
            hud.log(`${w.name} shrugs and goes back to the fire.`);
            roadFolk.settle(w.id, 'helped');
          },
          dismiss: () => { /* walked away mid-sentence: they are still standing there */ },
        });
        break;
      }
      case 'incident': {
        // a refugee is running FROM something, and that something is the news
        const trouble0 = trouble.describe(here?.id || 0)[0];
        hud.log(trouble0
          ? `${w.name} says ${here.name} is having a bad week — ${trouble0.blurb}.`
          : `${w.name} has not stopped since the last village and cannot say what they saw.`);
        if (here) rumours.hear(here, { from: `${w.name}, running` });
        roadFolk.settle(w.id, 'helped');
        break;
      }
      case 'race': {
        hud.log(`${w.name} is going in whether you do or not. Whoever reaches the bottom takes the box.`);
        roadFolk.settle(w.id, 'helped');
        break;
      }
      default:
        hud.log(`${w.name} has said their piece.`);
        roadFolk.settle(w.id, 'helped');
    }
    hud.setPlayer(player);
    autoSave();
  }

  /**
   * Standing at one of the places that fill a zone in.
   *
   * Some are a thing you do once (a shrine, a hunting blind); some take a few visits (a ring of
   * stones, a collapsed mine, a washed-out road). `data/landmarks.json` says which, and what each one
   * gives — all of it was parsed at boot and read by nothing until now.
   */
  function atLandmark(mark) {
    const here = hud.here;
    if (!here) return;
    sound.ui('open');
    hud.log(`${mark.name}. ${mark.blurb}`, '');
    holdings.visitLandmark(here.id, mark.id);

    if (mark.steps) {
      const out = holdings.workLandmark(here.id, mark.id);
      if (!out) return;
      if (!out.finished) {
        hud.log(`${mark.does} ${out.left} more ${out.left === 1 ? 'visit' : 'visits'}.`, '');
        autoSave();
        return;
      }
      hud.log(`${mark.name} is finished.`, 'good');
      sound.questDone();
    }

    const gives = mark.gives || {};
    if (gives.rest) { player.hp = player.maxHp; player.mp = player.maxMp; hud.log('You rest. Nothing follows you here.', 'good'); }
    if (gives.revealZone) { map.revealZone?.(here.id); hud.log(`${here.name} goes on your chart.`, 'good'); }
    if (gives.perkPoint) { player.bonusPerks = (player.bonusPerks || 0) + gives.perkPoint; hud.log('A perk point, for the trouble.', 'level'); }
    if (gives.loot) { for (const it of rpg.loot.roll?.(gives.loot, player.level) || []) player.bag.push(it); }
    if (gives.bench) hud.log('An anvil, and a fire that never goes out. You can work here.', '');
    if (gives.crossing) hud.log('You can cross here.', '');
    if (gives.callsBeast) hud.log('Bait on the hook. Something bigger than usual will come.', 'bad');
    if (gives.opensDungeon) hud.log('The mouth is open. Something is down there.', 'loot');
    if (gives.travelBonus) hud.log('The road is whole again. Travelling through here is quicker now.', 'good');

    /**
     * THE SEVEN `gives` KEYS NOTHING READ.
     *
     * `data/landmarks.json` uses sixteen of them; nine were handled above and these seven were not,
     * so seven kinds of landmark were a name, a blurb and no consequence whatever. The territory
     * layer reads its own copy for the zone record, which is why this went unnoticed — the WORLD
     * knew something had happened at the standing stones and the player never found out.
     */
    if (gives.xp) {
      const levels = rpg.gainXp(player, Math.round(gives.xp * (1 + (player.level - 1) * 0.1)));
      hud.log(`${Math.round(gives.xp)} experience for the walk.`, 'level');
      if (levels > 0) { hud.log(`Level ${player.level}.`, 'level'); sound.questDone(); }
    }
    if (gives.curse) {
      // a landmark that costs you something is the only reason the ones that pay are interesting
      applyStatus(player, 'curse', skillData.statuses?.curse, gives.curse === true ? 1 : gives.curse);
      hud.log('Something here takes an interest in you. It does not feel like a blessing.', 'bad');
      sound.combat('death', { beast: true });
    }
    if (gives.reviveDaily) {
      // one charge, and the day it was granted — `reviveDaily` means daily
      player.reviveCharge = 1;
      player.reviveDay = Math.floor(state.elapsed / (balance.sky?.dayLengthSeconds ?? 900));
      hud.log('The water holds. If you fall today, you will get up once.', 'good');
    }
    if (gives.toll) {
      const due = Math.round(gives.toll === true ? 25 * player.level : gives.toll);
      if (player.gold >= due) {
        player.gold -= due;
        hud.log(`${due} gold to pass. The way is open.`, '');
        if (mark.faction) standings.deed(mark.faction, 'toll_paid');
      } else {
        hud.log(`They want ${due} gold and you have ${player.gold}. You go the long way round.`, 'bad');
      }
    }
    if (gives.namesFoe) {
      // the thing that lives here gets a NAME, which is what makes it worth coming back for
      const def = field.bossFor?.(player.level + 2, mark.x, mark.z) || (bestiary.enemies || [])[0];
      if (def) {
        const named = nameRare(def);
        // the campaign's own nemesis book: `onDeath` is what names one, and a stone that names a
        // foe is doing the same job without having to kill you first
        campaign.onDeath({ defId: def.id, name: named, level: player.level });
        hud.log(`A name is cut into the stone: ${named}. Whatever wore it is still about.`, 'bad');
        rumours.add(`${named} is said to walk near ${mark.name}`, { zone: here, from: 'the stone itself' });
      }
    }
    if (gives.callsPatrol) {
      const stops = holdings.landmarksIn(here.id).slice(0, 4).map(l => ({ x: l.x, z: l.z, name: l.name }));
      if (stops.length >= 2) {
        patrols.enter(here, stops);
        hud.log('The horn carries. Somebody is coming this way.', '');
      }
    }
    if (gives.startsIncident) {
      const kind = gives.startsIncident === true ? null : gives.startsIncident;
      const row = kind ? trouble.start(here.id, kind) : null;
      hud.log(row ? `${row.name}. ${row.blurb}.` : 'Something has been set in motion here.', 'bad');
    }

    if (mark.faction) standings.deed(mark.faction, 'job_done');
    hud.setPlayer(player);
    autoSave();
  }

  /** Open a chest: roll the haul, show the reward screen — or find out it was never a chest. */
  async function openChest(chest) {
    const level = dungeon ? dungeon.level : (zones.at(control.x, control.z)?.midLevel || player.level);
    const haul = chests.open(chest, { level, magicFind: player.derived.magicFind });
    if (!haul) return;
    sound.ui('open');
    if (haul.mimic) {
      hud.log('The chest opens its own lid. That is not a chest.', 'bad');
      const def = bestiary.enemies.find(d => d.id === 'hoard_mimic');
      if (def) await field.add(def, level, chest.x, chest.z, { rank: 'rare', modifiers: rpg.pickModifiers(bestiary.modifiers, 2, field.rng), name: 'The Waiting Lid' });
      return;
    }
    const mats = {};
    for (let i = 0; i < (haul.materialCount || 0); i++) {
      const pool = chest.kind === 'warded' ? ['dust', 'core', 'voidsalt', 'runeplate'] : chest.kind === 'gilded' ? ['dust', 'essence', 'emberglass', 'rimeshard'] : ['scrap', 'cloth', 'hide', 'essence'];
      const id = pool[Math.floor(field.rng() * pool.length)];
      mats[id] = (mats[id] || 0) + 1 + Math.floor(field.rng() * 2);
    }
    takeHaul({ items: haul.items, gold: haul.gold, mats });
    autoSave();
    rewards({
      title: chest.name, subtitle: 'The lid comes up.',
      gold: haul.gold, items: haul.items.map(rewardItem),
      extras: Object.keys(mats).length
        ? [{ kind: 'quest', text: Object.entries(mats).map(([k, v]) => `${v} ${craft.M[k]?.name || k}`).join(', ') }]
        : [],
      button: 'Take it',
    });
  }

  function applyGearLook() {
    const next = JSON.parse(JSON.stringify(look?.avatar || {}));
    next.held = heldLookFor(player.equipment.weapon);
    next.offhand = offhandLookFor(player.equipment.offhand);
    // phase 8: armour you can see — the base's tier picks the Chibi 2 part
    Object.assign(next, rpg.gearLook(player));
    actor.setAvatar(next);        // keeps the clip set it was built with
  }
  applyGearLook();

  /**
   * SOMETHING FALLS OUT OF THE SKY.
   *
   * A meteor is rolled every five minutes on the surface, is visible in the sky and on the map for
   * the whole thirty seconds it takes to come down, and leaves a Meteorite chest where it lands —
   * 1-3 items, never worse than rare, with the beams that go with that. See js/meteors.js.
   */
  const meteors = createMeteors({
    scene, terrain, chests, balance, rng: () => field.rng(),
    onWarn: m => {
      const away = Math.hypot(m.x - control.x, m.z - control.z);
      hud.log(`Something is coming down, about ${away > 1000 ? `${(away / 1000).toFixed(1)} km` : `${Math.round(away)} m`} off. Thirty seconds.`, 'level');
      sound.ui('open');
    },
    onLand: (m, chest) => {
      const away = Math.hypot(m.x - control.x, m.z - control.z);
      hud.log(away < 60 ? 'It comes down close enough to feel.' : 'It lands. Whatever is in it is still hot.', 'loot');
      sound.combat('death', { beast: true });
      if (chest) chest.name = 'Meteorite';
    },
  });

  // ---------------------------------------------------------------- the map
  let map = null;
  map = makeMap();
  folk = makeFolk();

  // ---------------------------------------------------------------- talking to people
  function talkContext(npc) {
    return {
      gold: player.gold,
      // the three shelves plus the buyback list — see js/town.js `shelves`
      shelves: npc.trades ? folk.shelves(npc, player.level) : null,
      stock: npc.trades ? folk.forSale(npc, player.level) : [],
      vehicles: npc.trades ? folk.vehicles() : [],
      ownsVehicle: (slot, key) => (player.vehicles?.owned?.[slot] || []).includes(key),
      crates: npc.gambles ? folk.CRATE_TIERS : [],
      // what in the bag would count toward one of this person's gather jobs
      gatherable: quest => gatherable(quest, player.bag),
      lastCrate, lastCrateLifted,
      bag: player.bag,
      offer: folk.questFrom(npc, { level: player.level, enemies: bestiary.enemies, nodes: world.nodes }),
      active: questLog.active,
      hasQuest: id => questLog.has(id),
      readyToTurnIn: giverId => questLog.readyToTurnIn(giverId),
      progressText: q => questLog.progressText(q),
    };
  }

  // what the gambler last pulled out of a crate, so the panel can show it
  let lastCrate = null, lastCrateLifted = false;

  const talk = createTalkPanel({
    describe: item => hud.describe(item),
    /**
     * The SAME hover card the inventory uses, on every row of the shop.
     *
     * "Update shops to support the same item hover effects as the menu, and also support comparing.
     * All item interfaces should have these tooltips." `hud.tipFor` already builds the full card —
     * properties, set progress, item level, and the delta against what you are wearing — so the
     * shop simply asks for it rather than growing a second, worse one.
     */
    tip: (node, item) => hud.tipFor(node, item),
    displayName: item => displayName(item),
    /**
     * One word on a shop row saying whether it beats what you are wearing.
     *
     * E1 again: the card on hover has carried the full comparison for rounds, but you have to hover
     * every row to use it, and a shelf of six Scepters all priced the same is unreadable until you
     * do. `itemScore` is the same number the inventory sorts and compares by, so the row and the
     * card can never disagree. Jewellery compares against the weaker of the two rings, which is the
     * one it would actually replace.
     */
    upgradeMark: item => {
      const slot = item.type === 'weapon' ? 'weapon'
        : item.slot === 'ring' ? (itemScore(player.equipment.ring2) < itemScore(player.equipment.ring) ? 'ring2' : 'ring')
        : item.slot;
      if (!slot || !(slot in player.equipment)) return null;
      const worn = player.equipment[slot];
      if (!worn) return { kind: 'up', text: 'empty slot' };
      const delta = itemScore(item) - itemScore(worn);
      if (delta > 0.5) return { kind: 'up', text: 'upgrade' };
      if (delta < -0.5) return { kind: 'down', text: 'worse' };
      return null;                              // too close to call; the card has the detail
    },
    /** Why you could not put this on — the level, or a two-handed rule. Null if you can. */
    cannotUse: item => rpg.equipRefusal(player, item) || null,
    buyVehicle: v => {
      const r = unlockVehicle(player, v.slot, v.key);
      hud.log(r.ok ? `The ${r.kind.name} is yours. Pick it on the character sheet.` : r.why, r.ok ? 'loot' : 'bad');
      if (r.ok) sound.coin(); else sound.ui('error');
      hud.setPlayer(player);
      talk.update(talkContext(talk.npc));
      autoSave();
    },
    submitGather: (quest, chosen) => {
      const out = submitGather(quest, player.bag, chosen);
      if (!out.ok) { hud.log(out.why, 'bad'); sound.ui('error'); return; }
      hud.log(out.done
        ? `${quest.title} — that is all of them.`
        : `Handed over ${out.taken.length}. ${out.left} to go.`, out.done ? 'good' : '');
      sound.ui('click');
      hud.setPlayer(player);
      talk.update(talkContext(talk.npc));
      autoSave();
    },
    gamble: tier => {
      const r = folk.gamble(talk.npc, tier.key, player, { level: player.level });
      if (!r.ok) { hud.log(r.why, 'bad'); sound.ui('error'); }
      else {
        lastCrate = r.item;
        lastCrateLifted = r.lifted;
        hud.log(`${tier.name}: ${r.item.name}.${r.lifted ? ' Better than the seal promised.' : ''}`, 'loot');
        sound.loot(r.item);
      }
      hud.setPlayer(player);
      talk.update(talkContext(talk.npc));
      autoSave();
    },
    /**
     * WHAT YOU PAY, AND WHY.
     *
     * `standings.priceMult` was written, exported and never called — so standing changed nothing a
     * player could feel at the one counter where it should be obvious. The shop's own deed-based
     * multiplier and the faction band now stack: be Trusted where the Greenhand hold the ground and
     * everything is 15% off; be Disliked and it is 40% more.
     */
    price: item => Math.max(1, Math.round(rpg.price(item) * shopMult())),
    /** One line the trade panel can print, so the number has a reason next to it. */
    standingNote: () => {
      const key = holdings.of(hud.here?.id)?.holder;
      if (!key) return null;
      const band = standings.band(key);
      if (!band || band.key === 'known') return null;
      const pct = Math.round((band.priceMult - 1) * 100);
      return `${intro.fullName(key)} hold this ground — ${band.name}${pct ? `, ${pct > 0 ? '+' : ''}${pct}% here` : ''}.`;
    },
    sellPrice: item => Math.max(1, Math.round(rpg.price(item) * (items.sellFactor ?? 0.35))),
    buy: item => {
      const r = folk.buy(talk.npc, item, player, shopMult());
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
      // the marker book mirrors the quest log, so the destination lands on the map, the minimap and
      // the rim arrow all at once — and goes away again when the job is turned in
      markers.syncQuests(questLog.active);
      if (quest.place) hud.log(`${quest.place.name} is marked. Press M to see it, or follow the arrow.`, '');
      talk.update(talkContext(talk.npc));
      autoSave();
    },
    turnIn: quest => {
      const reward = questLog.turnIn(quest);
      markers.syncQuests(questLog.active);
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
      // B8: a region's name is something you learn — by walking in, or by hearing about it. The map
      // read this off `window.farhold` because the agent that built it could not edit this file;
      // handed in properly, the map works with no global at all.
      rumours,
      terrain, seed,
      getPlayer: () => control,
      getEnemies: () => field.enemies,
      onTeleport: (x, z) => { control.teleport(x, z); rebuildWorldAround(true); field.clear(); },
      markers,
      // round 4: the level-band overlay, and the dungeon mouths and camps to plan a route around
      zones,
      getLevel: () => player.level,
      sites: { get sites() { return sites.sites; } },
      meteors: { get marks() { return meteors.marks(); } },
      gates: { get nodes() { return gates.nodes; } },
      showCoords: () => !!settings.get('coords'),
      // "Make the current teleport feature a debug option, but keep it enabled by default"
      allowDebugTeleport: () => settings.get('debugTeleport') !== false,
      // every base the character ever raised, and the trip home from here — see js/homes.js
      bases: {
        list: () => homes.overview({ ...worldKey(), x: control.x, z: control.z }),
        go: id => returnToBase(id),
      },
      /**
       * F15: the waypoint network, and what happens when you click one.
       *
       * "Allow clicking on waypoints on the map to fast travel between them." The map draws every
       * pad, greys the ones you have not lit, and calls this for the rest. "Go here" stays beside
       * it — the user considers it cheating but asked for it to remain for debugging.
       */
      waypoints: {
        list: () => waypoints.list(),
        travel: id => {
          const here = waypoints.settlementAt(control.x, control.z);
          const can = waypoints.canTravel(id, {
            fighting: field.enemies.some(e => e && e.state === 'chase'),
            underground: !!dungeon,
            fromId: here?.id ?? null,
          });
          if (!can.ok) { hud.log(can.why, 'bad'); sound.ui('error'); return false; }

          // what a town portal would anchor to, once BUILDING_EXPANSION's portal is built
          /**
           * THE TOWN PORTAL OPENS BEHIND YOU.
           *
           * Travelling to a waypoint leaves a way back to exactly where you were standing. Opening
           * a new one closes any existing one — there is only ever one, because in js/portal.js the
           * whole state is a single variable and there is nowhere for a second to live.
           */
          const from = waypoints.noteDeparture(control.x, control.z, planet?.name || null);
          const opened = portals.open({
            anchor: { x: from.x, z: from.z, world: from.world },
            exit: { x: can.pad.x, z: can.pad.z, world: planet?.name || null, name: can.pad.name },
          });
          if (opened?.closed) hud.log('The portal you left open has closed.', '');
          build.showPortal?.(portals.portal?.exit || null);
          const hours = waypoints.hoursFor(control.x, control.z, can.pad);
          control.teleport(can.pad.x, can.pad.z);
          rebuildWorldAround(true);
          field.clear();
          sky.advanceHours?.(hours);
          hud.log(`You step onto the sigil at ${can.pad.name}. ${hours < 1 ? 'Half a day' : Math.round(hours) + ' hours'} on the road.`, 'level');
          sound.ui('click');
          autoSave();
          return true;
        },
      },
    });
  }

  /** Build a world and put the player on it. `spot` is {u, v} across the map, from a landing. */
  function buildPlanet(nextPlanet, spot = null) {
    if (dungeon) leaveDungeon();
    disposePlanet();

    planet = nextPlanet;
    // Markers belong to a world, not to the player: landing somewhere else must not drag the last
    // planet's pins along with you. They stay in the book, filed under the world they were made on,
    // and space mode puts a ring round the worlds that still hold one.
    markers.setWorld({ systemSeed, planetId: planet.id, planetName: planet.name, starName: star.name });
    world = generatePlanetMap(planet, mapSize);
    terrain = makeTerrain(world, planet, balance.terrain);
    // a new world starts unshaped; the brushes are per planet, like the waypoint network
    terraform = createTerraform({ saved: null });
    terrain = terraform.wrap(terrain);
    palette = atmospherePalette(planet);
    // a new world has its own regions, so it has its own level bands
    band = bandForPlanet(planet);
    zones = buildZones(world, {
      spawn: [terrain.spawnPoint().x, terrain.spawnPoint().z],
      maxLevel: band.max, bandWidth: balance.zones?.bandWidth ?? 4, startLevel: band.min,
    });
    hud.log(`${planet.name} — ${band.name.toLowerCase()}, levels ${band.min}–${band.max}. ${band.blurb}`, 'level');
    hud.zones = zones;

    sky = createSky({ star, system, planet, balance, palette });
    scene.add(sky.sunLight); scene.add(sky.sunLight.target); scene.add(sky.ambient);
    scene.fog = sky.fog;

    view = createTerrainView(scene, terrain, {
    // the terrain knobs are a knob file like everything else; without this `maxSkirtScale` and
    // friends were code defaults nobody could tune
    ...(balance.terrain || {}), rings: ringSpec, waterColor: palette.sea });
    props = createProps(scene, terrain, {
      seed,
      density: lowQuality ? 0.45 : (balance.props?.density ?? 1),
      radius: lowQuality ? 4 : (balance.props?.radius ?? 7),
      grassPerCell: lowQuality ? 60 : (balance.props?.grassPerCell ?? 150),
    });
    features = createFeatures(scene, terrain, {
      palette, seed, radius: lowQuality ? 1500 : (balance.features?.radius ?? 2600),
      waypointLit: id => waypoints?.isLit?.(id),
    });
    // a new world has its own seams, on its own seed
    ore = createNodeWorld({ data: resourceData || {}, seed, terrain, planet: nextPlanet, band: nextPlanet?.band || 'medium' });
    mining.setOre?.(ore);
    oreView?.dispose?.();
    oreView = createOreView(scene, { data: resourceData || {} });

    // A pad on another planet is not somewhere you can WALK to, so the network is rebuilt per
    // world — but the bases on this world come back out of the register, which is not.
    waypoints = createWaypoints({
    settlements: features.settlements, seed,
    built: homes.forWorld({ systemSeed, planetId: nextPlanet?.id ?? planet?.id ?? null }),
    // the same test js/features.js uses to site the pad, so the two cannot disagree
    groundOk: (x, z) => !terrain.underwater(x, z) && terrain.riverAt(x, z) <= 0.3
      && terrain.slopeAt(x, z, 4) <= 0.5,
  });
    weatherView = createWeatherView({
      scene, skyScene: sky.scene, palette, seed, quality: lowQuality ? 'low' : 'high',
    });

    control = createController(terrain, balance, camera, {
      obstacles: [props.solids, features.solids], settings,
      boat: () => vehicleFor(player, 'boat'),
      derived: () => player.derived,
    });
    field = makeField();
    field.solids = [props.solids, features.solids];
    encounters = createEncounters({
      field, zones, terrain, balance, data: encounterData,
      onLog: (t, c) => hud.log(t, c), isNight: () => sky.isNight,
    });
    pets.setTerrain(terrain);
    chests.clear();
    chests = createChests(scene, terrain, { seed, balance, zones, rpg, collide: props.solids });
    gates.dispose();
    gates = createGates(scene, terrain, { balance, zones, radius: balance.features?.radius ?? 2600, collide: features.solids });
    sites.dispose();
    sites = createSites(scene, terrain, { seed, balance, zones, collide: features.solids, radius: balance.features?.radius ?? 2600 });
    folk = makeFolk();
    hud.setTerrain(terrain);
    map = makeMap();

    const start = spot
      ? { x: spot.u * terrain.widthM, z: spot.v * terrain.depthM }
      : { x: control.spawn.x, z: control.spawn.z };
    control.teleport(start.x, start.z);
    /**
     * NEVER come down in the sea.
     *
     * The old guard fell back to `control.spawn` — but `spawn` is read once when the controller is
     * built, and on an ocean world the fallback can be wet too. This walks outward from where you
     * aimed until it finds dry, walkable ground, and only then gives up on the spawn.
     */
    if (terrain.waterAt(control.x, control.z)) {
      let landed = false;
      for (let ring = 1; ring <= 14 && !landed; ring++) {
        for (let k = 0; k < 12 && !landed; k++) {
          const a = (k / 12) * Math.PI * 2 + ring;
          const r = ring * terrain.widthM * 0.035;
          const [x, z] = terrain.clampToWorld(start.x + Math.cos(a) * r, start.z + Math.sin(a) * r);
          if (terrain.waterAt(x, z) || terrain.slopeAt(x, z, 6) > 0.6) continue;
          control.teleport(x, z);
          landed = true;
        }
      }
      if (!landed) control.teleport(control.spawn.x, control.spawn.z);
    }

    weather = new WeatherClock({
      weights: weatherWeights(terrain.climateAt(control.x, control.z)),
      seed,
      minMinutes: balance.weather?.minMinutes ?? 1.2,
      maxMinutes: balance.weather?.maxMinutes ?? 4,
      transitionSeconds: balance.weather?.transitionSeconds ?? 20,
    });
    blended = weather.blend();
    weatherCell = [-1, -1];

    state.elapsed = morningElapsed();
    rebuildWorldAround(true);
    chests.update(control.x, control.z);
    gates.update(control.x, control.z, true);
    sites.update(control.x, control.z, true);
    if (campaign.onLandOn(planet.id)) hud.log(`${planet.name} charted.`, 'level');
    $('hud-planet').textContent = describePlanet(planet, star);
    return planet;
  }

  function ensureSpace() {
    if (!space) {
      // the BACKDROP is seeded by the system, not the run: "different systems should have different
      // properties in the skybox", and a jump has to look like it took you somewhere
      space = createSpace({ star, system, homePlanet: planet, homeWorld: world, balance, seed: systemSeed });
    }
    return space;
  }

  // ---------------------------------------------------------------- the chart, and the jump

  /** The star chart. It replaces the world map whenever there is no ground under you. */
  const chart = createStarChart({
    getState: () => ({
      galaxy, starId, star: starNow(), system, systemSeed,
      bodies: space?.bodies || null,
      /**
       * What the survey of another star can tell you: what is orbiting it and roughly how hard each
       * one is. Building the system costs a few milliseconds and the answer is cached per star, so
       * clicking around the chart stays instant.
       */
      surveyOf: star => surveyStar(star),
      /** …and the surface of a world you have actually been down to. */
      surfaceOf: p => surfaceKnown(p),
      // the ship's position in AU, for the "you are here" dot on the system view
      shipAu: space ? { x: space.state.position.x / space.AU, z: space.state.position.z / space.AU } : null,
      markers: markers.markers,
    }),
    onTravel: (target, reach) => beginJump(target, reach),
    onClose: () => regrab(),
  });

  /**
   * The survey cache. A star's system is deterministic from its seed, so this is a pure function
   * with a memo in front of it rather than any kind of state.
   */
  const surveyCache = new Map();
  function surveyStar(target) {
    if (!target) return null;
    if (surveyCache.has(target.id)) return surveyCache.get(target.id);
    let out = null;
    try {
      const built = target.id === starId ? { system } : createSystem({ seed: target.seed });
      const planets = (built.system.planets || []).map(p => ({
        name: p.name,
        kind: p.giant ? 'gas giant' : (p.archetypeName || p.archetype || 'world'),
        band: bandForPlanet(p).name,
        color: p.giant ? '#d8b070' : p.atmosphere?.breathable ? '#8fe0a0' : '#8fb8d8',
      }));
      const moons = (built.system.planets || []).reduce((n, p) => n + (p.moons?.length || 0), 0);
      out = { planets, moons };
    } catch { out = null; }
    surveyCache.set(target.id, out);
    return out;
  }

  /**
   * What is known about a world's SURFACE — only ever the one you are standing on, because that is
   * the only surface map this run has built. Everything else honestly says it is unmapped.
   */
  function surfaceKnown(p) {
    if (!p || p.id !== planet.id || !world) return null;
    const counts = new Map();
    for (const b of world.biome) counts.set(b, (counts.get(b) || 0) + 1);
    const total = world.biome.length || 1;
    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([id, n]) => ({ name: BIOMES?.[id]?.name || `biome ${id}`, share: Math.round((n / total) * 100) }));
    return {
      regions: world.regions?.length || 0,
      biomes: counts.size,
      towns: (world.nodes || []).filter(n => n.type === 'settlement' || n.type === 'port').length,
      top,
    };
  }

  const warp = createWarp({ opts: { seconds: balance.space?.warpSeconds ?? 5 } });
  let jump = null;          // { from, to, reach } while the drive is running

  /**
   * Fold to another star.
   *
   * Five seconds of tunnel, then the whole system is thrown away and rebuilt from the target star's
   * seed — a new star, new worlds, a new backdrop — and the ship comes out of it in orbit. The
   * character, the bag, the quests and every marker come along untouched; markers are filed under
   * the world they were made on, so nothing from the old system follows you onto the new one's map.
   */
  function beginJump(target, reach = null) {
    if (!target || target.id === starId) return false;
    if (mode !== 'space') { hud.log('The drive only spins up in open space.', 'bad'); return false; }
    jump = { from: starNow(), to: target, reach: reach || reachFrom(galaxy, starNow(), target) };
    if (!jump.reach.ok) { hud.log(jump.reach.why, 'bad'); jump = null; return false; }
    warp.attach(space.scene);
    warp.start({ from: jump.from, to: jump.to, seconds: balance.space?.warpSeconds ?? 5 });
    // point the nose out of the system before the drive catches, so the tunnel flies away from
    // whatever you were parked beside instead of straight through it
    const out = space.state.position.clone();
    if (out.lengthSq() < 1e-6) out.set(1, 0, 0.2);
    out.normalize();
    space.state.yaw = Math.atan2(out.x, out.z);
    space.state.pitch = Math.asin(Math.max(-1, Math.min(1, out.y))) + 0.25;
    mode = 'warp';
    modeT = 0;
    hud.log(`Drive engaged. ${Math.round(jump.reach.ly).toLocaleString()} light years to ${target.name}.`, 'level');
    return true;
  }

  /**
   * Come out of the tunnel somewhere else entirely.
   *
   * Only the SYSTEM is built here — the star, its worlds, their orbits. A surface map is 256×128
   * cells of erosion and rivers and costs about a second, and there is no reason to pay it for a
   * world nobody has decided to land on yet; `buildPlanet` does that when you actually go down.
   */
  function arriveAt(target) {
    const built = createSystem({ seed: target.seed });
    star = built.star;
    system = built.system;
    const firstWorld = chooseLanding(system) || system.planets[0];
    // keep the chart's idea of the star in step with the one we actually built
    target.name = star.name;
    target.classKey = star.classKey;
    target.className = star.className;
    target.color = star.color;
    starId = target.id;
    systemSeed = target.seed;
    // markers are filed by system, so the new one starts with a clean map and the old one keeps its
    markers.setWorld({ systemSeed, planetId: -1, planetName: '', starName: star.name });

    // the old system's scene, models and textures all go
    space?.dispose?.();
    space = null;
    // there is no "home world" out here until you land on one, so the space scene draws every world
    // from its procedural texture rather than a real surface map
    space = createSpace({ star, system, homePlanet: firstWorld, homeWorld: null, balance, seed: target.seed });
    warp.attach(space.scene);
    space.enter({ fromPlanet: firstWorld, elapsed: state.elapsed, offset: 6 });
    camera.far = 600000; camera.updateProjectionMatrix();
    mode = 'space';
    jump = null;
    hud.log(`${star.name}. ${star.className}, ${(system.planets || []).length} worlds.`, 'good');
    hud.log('M for the chart · fly at a world to drop into its air', '');
    autoSave();
  }

  /** Leave the ground. */
  /**
   * Board the ship. There is no cinematic any more: you fly it, in the world, in metres, and when
   * you are high enough the space scene takes over with the sky already black. See js/atmos.js.
   */
  function launch() {
    if (mode !== 'ground') return;
    if (dungeon) { hud.log('Not down here.', 'bad'); return; }
    /**
     * YOU DO NOT START WITH A SHIP.
     *
     * BUILDING_EXPANSION.md §9: four subsystems, a rare element and a tank of fuel before the sky
     * opens. `canLaunch` also refuses a launch that would leave you nothing to land with, and says
     * which part is missing rather than greying a key out in silence. An existing save keeps the
     * ship it already had — `migrateShipyard` ran at boot.
     */
    const gate = canLaunchShip(player);
    if (!gate.ok) { hud.log(gate.why, 'bad'); sound.ui('error'); return; }
    spendFlightFuel(player, 'launch');
    ensureSpace();
    ensureAir().board(control);
    input.grab();                       // the mouse steers the ship; you cannot fly without it
    actor.group.visible = false;
    if (horse) horse.group.visible = false;
    mode = 'air';
    hud.log('W/S throttle · mouse steers · A/D roll · Space up · C down · Shift boost · J to set down', 'level');
    hud.log('Climb high enough and you leave the atmosphere.', '');
  }

  /** Put down on whatever the ship is close enough to — which now means flying down to it. */
  function land() {
    if (mode === 'air') {
      // already in the air over a world: put the ship on the ground and step out
      const out = air.readout();
      if (out.altitude > air.cfg.landHeight || out.speed > air.cfg.landSpeed) {
        hud.log(`Too fast or too high to set down — under ${air.cfg.landSpeed} m/s and ${air.cfg.landHeight} m up.`, 'bad');
        return;
      }
      stepOut();
      return;
    }
    if (mode !== 'space') return;
    const target = space.canLand();
    if (!target) {
      // say WHY, using the same card the reticle draws
      const under = space.targetUnder(space.heading());
      const card = space.describe(under);
      hud.log(card && !card.landable ? card.why : 'Nothing close enough to land on. Fly nearer a world.', 'bad');
      return;
    }
    beginDescent(target);
  }

  /**
   * GO HOME, FROM ANYWHERE.
   *
   * "It should be easy to teleport back to your bases even if you go to a different star system."
   *
   * js/homes.js works out how many legs the trip takes; this takes them. All three endings put the
   * player on the sigil, because the pad IS the destination — §5 of BUILDING_EXPANSION is explicit
   * that you arrive standing on it — and all three open the town portal behind you, so the way back
   * to whatever you were doing is the same whether home was over the hill or four hundred light
   * years away.
   *
   * The refusals are the waypoint network's own, not new ones. A base is a waypoint; it should not
   * have a second, different rulebook just because you built it.
   */
  function returnToBase(id) {
    const route = homes.routeTo(id, { ...worldKey(), x: control.x, z: control.z });
    if (!route.ok) { hud.log(route.why, 'bad'); sound.ui('error'); return false; }
    if (field.enemies.some(e => e && e.state === 'chase')) {
      hud.log('Not while something is trying to kill you.', 'bad'); sound.ui('error'); return false;
    }
    if (dungeon) { hud.log('Not from underground. Get back to the surface first.', 'bad'); sound.ui('error'); return false; }
    const base = route.base;

    // the way back, opened before anything moves, so the anchor is where the player actually stood
    const from = waypoints.noteDeparture(control.x, control.z, planet?.name || null);
    const opened = portals.open({
      anchor: { x: from.x, z: from.z, world: from.world },
      exit: { x: base.x, z: base.z, world: base.planetName || null, name: base.name },
    });
    if (opened?.closed) hud.log('The portal you left open has closed.', '');

    /**
     * A FOLD IS A FOLD, whether the sigils do it or the drive does.
     *
     * Rebuilding the system from the base's own `systemSeed` is exactly what `arriveAt` does coming
     * out of warp — a star is its seed — so travelling home across the galaxy costs the same second
     * of generation and lands in the same place it would have if you had flown.
     */
    if (route.step === 'jump') {
      const target = galaxy.stars[base.starId] || { id: base.starId, seed: base.systemSeed, name: base.starName };
      // Not from inside the tunnel — there is nowhere to leave a portal and nothing to leave it at.
      // Everywhere else is allowed on purpose: "It should be easy to teleport back to your bases
      // even if you go to a different star system", and making the player land on some unrelated
      // world first so they can stand on a sigil is the opposite of easy.
      if (mode === 'warp') { hud.log('Not mid-jump.', 'bad'); return false; }
      const built = createSystem({ seed: base.systemSeed });
      star = built.star;
      system = built.system;
      starId = base.starId ?? starId;
      systemSeed = base.systemSeed;
      if (target) { target.name = star.name; target.classKey = star.classKey; }
      space?.dispose?.();
      space = null;
      hud.log(`The sigils fold ${Math.round(base.x / 1000)} km and ${star.name} with them.`, 'level');
    }

    if (route.step === 'jump' || route.step === 'land') {
      const all = [...system.planets, ...system.planets.flatMap(x => x.moons || [])];
      const p = all.find(x => x.id === base.planetId);
      if (!p) { hud.log(`${base.name} is not where the chart says it is.`, 'bad'); return false; }
      camera.far = 24000; camera.updateProjectionMatrix();
      buildPlanet(p, null);
      mode = 'ground';
    }

    control.teleport(base.x, base.z);
    rebuildWorldAround(true);
    field.clear();
    // a longer trip is a longer trip: one leg is the ordinary waypoint cost, three is most of a day
    const hours = Math.min(24, waypoints.hoursFor(from.x, from.z, base) * route.legs);
    sky.advanceHours?.(hours);
    build.showPortal?.(portals.portal?.exit || null);
    hud.log(`You step onto the sigil at ${base.name}. ${Math.round(hours)} hours.`, 'level');
    sound.ui('click');
    autoSave();
    return true;
  }

  /** Come down out of space into the air over a world, and keep flying. */
  function beginDescent(target) {
    const spot = space.landingSpot(target.body);
    camera.far = 24000; camera.updateProjectionMatrix();
    buildPlanet(target.planet, spot);
    ensureAir();
    air.setTerrain(terrain);
    air.descend({ x: control.x, z: control.z }, { yaw: control.yaw });
    actor.group.visible = false;
    if (horse) horse.group.visible = false;
    mode = 'air';
    hud.log(`Coming down on ${planet.name}. ${describePlanet(planet, star)}`, 'level');
    hud.log('Pull up and set down gently — J when you are slow and low.', '');
  }

  /** Get out of the ship where it is standing. */
  function stepOut() {
    // whatever the flight thinned out comes back
    lastAirLod = -1;
    view.setSkirtScale(1, air.state.x, air.state.z);
    view.setViewScale(viewMul(), air.state.x, air.state.z);
    // the scatter comes back to full density on the ground, at the player's own setting
    props.setDensity(settings.get('density') ?? 1, air.state.x, air.state.z);
    props.setGrass(settings.get('grass') !== false, air.state.x, air.state.z);
    props.setRadius(lowQuality ? 5 : 7, air.state.x, air.state.z);
    props.setDensity(settings.get('density') ?? 1, air.state.x, air.state.z);
    props.setGrass(settings.get('grass') !== false, air.state.x, air.state.z);
    const st = air.state;
    control.teleport(st.x, st.z);
    control.yaw = st.yaw;
    air.leave();
    actor.group.visible = true;
    mode = 'ground';
    rebuildWorldAround(true);
    hud.log(`You set down on ${planet.name}.`, 'good');
    autoSave();
  }

  let air = null;
  let airShip = null;
  function ensureAir() {
    if (!air) {
      // Its OWN hull. Re-parenting `space.ship` into the ground scene took it OUT of the space
      // scene — a Three object has one parent — and flight in space went first-person with no ship
      // in front of you at all.
      airShip = createShip('explorer');
      airShip.group.scale.setScalar((balance.space?.shipScale ?? 12) * 0.22);
      airShip.group.visible = false;
      scene.add(airShip.group);
      air = createAtmosphere({
        scene, terrain, balance, settings,
        ship: airShip,
        onLog: (t, c) => hud.log(t, c),
      });
    }
    return air;
  }

  /** Everything that happens when you are not standing on a planet. */
  function stepFlight(dt, snap) {
    modeT += dt;
    const spaceCfg = balance.space || {};

    // ---------------------------------------------------------------- flying in the air
    if (mode === 'air') {
      const out = air.update(dt, snap, camera);
      if (out.bumped) { sound.combat('hit'); hud.log('The hull scrapes. No harm done.', ''); }

      // The world streams under the SHIP. Props and buildings are also thinned out with altitude:
      // at 4 km you cannot make out a bush, and drawing forty thousand of them is pure waste.
      rebuildWorldAround(false, air.state);
      chests.update(air.state.x, air.state.z);
      gates.update(air.state.x, air.state.z);
      sites.update(air.state.x, air.state.z);
      const high = Math.min(1, Math.max(0, (air.state.y - terrain.heightAt(air.state.x, air.state.z)) / 2600));
      if (Math.abs(high - lastAirLod) > 0.12) {
        lastAirLod = high;
        /**
         * Props REACH FURTHER and thin out as you climb, rather than simply switching off.
         *
         * At ground level the scatter is seven cells across; from a kilometre up it is nearly three
         * times that at a fifth of the density, so the forest runs to the horizon instead of ending
         * in a circle around the ship. The two together keep the instance count roughly flat.
         */
        const baseRadius = lowQuality ? 5 : 7;
        // the reach scales with the view the player asked for, so a 6x card sees trees as far as it
        // draws ground rather than a ring of them inside an empty plain
        props.setRadius(Math.round(baseRadius * (1 + high * 1.9) * Math.sqrt(viewMul())), air.state.x, air.state.z);
        props.setDensity((settings.get('density') ?? 1) * Math.max(0, 1 - high * 1.15), air.state.x, air.state.z);
        props.setGrass(high < 0.25 && settings.get('grass') !== false, air.state.x, air.state.z);
        // and deepen the clipmap skirts, because from up here you are looking straight down the
        // seam between two rings and a head-height skirt does not cover it
        view.setSkirtScale(1 + high * 7, air.state.x, air.state.z);
        // …and STRETCH the rings, for the same triangle count. "You should see many chunks away but
        // at lower resolution. As you get lower altitude the planet should get more detailed and
        // eventually props should appear." At the ceiling the view reaches ten kilometres; on the
        // way down it tightens back up and the grass comes back.
        view.setViewScale(viewMul() * (1 + high * 5), air.state.x, air.state.z);

      }
      const blend = air.spaceBlend();
      // the sky drains to black on the way up and fills back in on the way down
      sky.update(state.elapsed, { gloom: blend, cloud: blended.cloud, longitude: air.state.x / terrain.widthM });
      sky.sunLight.intensity *= 1 - blend * 0.35;
      scene.fog.near = 40 + blend * 4000;
      scene.fog.far = 7000 + blend * 40000;

      if (out.leftAtmosphere) {
        // hand over: the space scene, positioned off the world we just climbed away from
        ensureSpace().enter({ fromPlanet: planet, elapsed: state.elapsed });
        camera.far = 600000; camera.updateProjectionMatrix();
        air.leave();
        light.setSpots(false);            // nothing to light between the worlds
        mode = 'space';
        hud.log(`${planet.name} falls away below you.`, 'level');
        hud.log('W to fly · Shift to boost · hold Space to warp · point at a world and press J to land', '');
        autoSave();
      }

      /**
       * L in the air is the landing lights.
       *
       * Same key as the lamp on foot — "allow the light when on foot to be toggled on both with the
       * hotkey L for light" — because from the player's side it is one idea: L means light, and what
       * that means depends on whether you are standing on the ground or flying over it.
       */
      if (snap.pressed?.has('KeyL')) {
        light.setSpots(!light.spotsOn);
        hud.log(light.spotsOn ? 'Landing lights on.' : 'Landing lights off.');
      }
      light.aimSpots(air.state, air.state?.yaw ?? 0, -0.35);

      /**
       * B2: the minimap follows the SHIP.
       *
       * The ground tick is what draws the minimap, and flight returns out of `stepFlight` long
       * before it — so the canvas kept whatever was painted the last time the player was on foot,
       * and the arrow sat at the spot they took off from however far they flew.
       */
      if (state.frames % 6 === 0) hud.drawMinimap(air.state, field.enemies, [], []);

      const r = air.readout();
      hud.prompt(out.landed ? '<b>J</b> set down' : null);
      hud.tick(player, {
        place: `${planet.name} · in the air`,
        zone: null,
        clock: `${r.altitude} m · ${r.speed} m/s`,
        target: null,
        /**
         * The upper atmosphere says what it is, and what the controls do up there.
         *
         * A player who climbs into a band where the throttle has quietly changed meaning needs to be
         * told, once, in the place they are already looking. Below it, the old line still points the
         * way out.
         */
        sky: r.regime === 'high'
          ? (r.holding != null
            ? `holding station at ${r.holding} m — nose down to descend, up to climb`
            : `upper atmosphere · ${r.climb > 0 ? '+' : ''}${r.climb} m/s — level out to hold this altitude`)
          : 'climb to leave the atmosphere',
        weather: r.regime === 'high'
          ? `rate ${Math.round((r.throttle || 0) * 100)}% · air ${Math.round(r.air * 100)}%`
            + `${r.holding != null ? ' · station held' : ''}`
          : `throttle ${Math.round(r.throttle * 100)}%${r.boosting ? ' · boost' : ''}`
            + `${r.lift > 0 ? ' · climbing' : r.lift < 0 ? ' · descending' : ''} · air ${Math.round(r.air * 100)}%`,
        where: `seed ${seed} · x ${Math.round(air.state.x)} z ${Math.round(air.state.z)} · ${r.altitude} m`,
      });
      return;
    }

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
      // FLY into an atmosphere rather than pressing a key at it. `space.atmosphereEntry()` fires
      // once the ship has dropped inside half a radius of a landable world; the descent then picks
      // up exactly where the space flight left off, over the point the ship was actually above.
      const entry = space.atmosphereEntry();
      if (entry) {
        hud.log(`You fall into ${entry.planet.name}'s air.`, 'level');
        beginDescent(entry);
        return;
      }
      const r = space.readout();
      // the reticles: a bracket round every world in view, and a card on the one you are pointing at
      const marks = space.marks(camera);
      const under = space.targetUnder(space.heading());
      // hang each world's markers off its bracket, so a tracked quest is visible from orbit
      const byWorld = new Map();
      for (const m of markers.inSystem(systemSeed)) {
        if (!byWorld.has(m.planetId)) byWorld.set(m.planetId, []);
        byWorld.get(m.planetId).push(m);
      }
      for (const mk of marks) mk.markers = (byWorld.get(mk.body?.planet?.id) || []).map(m => m.kind);
      const card = space.describe(under);
      if (card && under?.planet) card.markers = byWorld.get(under.planet.id) || [];
      hud.reticles(marks, under, camera, card);
      hud.tick(player, {
        place: `${star.name} system`,
        zone: null,
        clock: `${r.target} · ${r.distanceAu.toFixed(2)} AU`,
        target: null,
        sky: r.canLand ? 'close enough to land — press J, or just keep going down' : 'fly to a world to land on it',
        weather: `${r.mode}${r.warpCharge > 0.05 ? ` (warp ${Math.round(r.warpCharge * 100)}%)` : ''} · ${speedText(r.speed, space.AU)}`
          + (r.approach < 0.92 ? ` · slowing (${Math.round(r.approach * 100)}%)` : '')
          // "warp locked" read like a fault in the drive. It is a rule: you cannot warp with a
          // world in your lap, and the fix is to fly away from it.
          + (r.crowded ? ' · warp needs open space' : ''),
        where: `seed ${seed} · in flight`,
        flying: true,
      });
      // the minimap is the system from above up here, not the ground we left standing on the canvas
      if (state.frames % 6 === 0) {
        hud.drawSystemMap({
          bodies: space.bodies.filter(b => !b.moon).map(b => ({
            x: b.position.x / space.AU, z: b.position.z / space.AU,
            giant: !!b.planet.giant,
            target: b.planet.name === r.target,
          })),
          ship: { x: space.state.position.x / space.AU, z: space.state.position.z / space.AU },
          yaw: space.state.yaw,
        });
      }
      return;
    }

    if (mode === 'warp') {
      // The tunnel. The system is still there behind it and still being flown through, so the
      // streaks have something to streak past; at the halfway mark the arrival is built and the
      // second half of the ramp plays over the NEW sky.
      const out = warp.update(dt, camera);
      space.state.throttle = 1;
      space.update(dt, null, camera);
      // the system itself streaks past — without this the tunnel plays over a set of stationary
      // planets, which reads as a screen effect rather than as going somewhere
      space.warpStretch(out.intensity, space.heading());
      if (out.done) {
        space.releaseWarp();
        if (jump) arriveAt(jump.to);
        else mode = 'space';
      }
      hud.reticles(null);
      hud.tick(player, {
        place: jump ? `${jump.from.name} → ${jump.to.name}` : 'in transit',
        zone: null,
        clock: jump ? `${Math.round(jump.reach.ly).toLocaleString()} ly` : '',
        target: null,
        sky: 'the stars draw out into lines',
        weather: `warp · ${Math.round(out.t * 100)}%`,
        where: 'between stars',
        flying: true,
      });
      // between stars there is no system to draw — an empty field rather than the last planet's map
      if (state.frames % 6 === 0) hud.drawSystemMap({});
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
    if (mode === 'ground' || mode === 'launch' || mode === 'air') {
      // Underground there is no sky to draw — just black behind the walls, which is what a dungeon
      // with no ceiling should look like from inside.
      if (!dungeon) {
        renderer.render(sky.scene, sky.camera(camera));
        renderer.clearDepth();
      }
      renderer.render(scene, camera);
    } else {
      renderer.render(space.scene, camera);
    }
    document.body.dataset.ready = '1';
    state.ready = true;
  }

  // ---------------------------------------------------------------- place the player
  control.teleport(control.spawn.x, control.spawn.z);
  /**
   * Start a new run in the MORNING.
   *
   * The bug: `sky.js` gives every world a local time — the sun's angle is
   * `elapsed/dayLength + startFraction + longitude`, and `longitude` is where you are on the map,
   * 0..1. So `startFraction: 0.34` only meant "morning" at longitude 0; landing two thirds of the
   * way across the map added 0.66 and put you at half past ten at night. Winding the clock back by
   * the player's own longitude makes startFraction mean what it says wherever you come down.
   */
  function morningElapsed() {
    const dayLength = balance.sky?.dayLengthSeconds ?? 900;
    const longitude = control.x / terrain.widthM;
    return (((1 - longitude) % 1) + 1) % 1 * dayLength;
  }
  state.elapsed = morningElapsed();
  // no eclipse for the first two in-game hours — a first impression of a sunlit world should be one
  sky.holdEclipsesUntil?.(state.elapsed + (balance.sky?.eclipseGrace ?? 450));
  if (save) {
    state.elapsed = restore(save, { rpg, player, control, map }) || 0;
    // written on every save since round 3 and never read back, so the save list's clock restarted
    state.playtime = Math.max(0, Math.round(save.playtime || 0));
    if (save.world && !saveCarriesWorld(save)) {
      hud.log('This save was written before the world settings travelled with it — it may not line up.', 'bad');
    }
  }
  rebuildWorldAround(true);
  actor.group.position.set(control.x, control.y, control.z);
  applyGearLook();
  hud.setPlayer(player);

  /**
   * Stream the world around a point. It used to hard-code the CHARACTER's position, so flying the
   * ship left a square of detailed ground sitting where you took off and nothing but empty
   * clipmap beyond it — "the map does not update".
   */
  function rebuildWorldAround(force = false, at = null) {
    if (dungeon) return;                 // the surface is hidden; do not stream it while you are down there
    const x = at ? at.x : control.x, z = at ? at.z : control.z;
    view.update(x, z, force);
    props.update(x, z, force);
    features.update(x, z, force);
  }

  $('hud-planet').textContent = describePlanet(planet, star);
  hud.log(save ? `Welcome back, ${player.name}.` : `You land on ${planet.name}.`);
  if (!save && created.movedSeed) {
    hud.log(`Seed ${seed} had nowhere worth starting — this is system ${systemSeed}, the nearest that did.`, '');
  }

  /**
   * ================================================================ walking into a zone
   *
   * Everything the territory layer does for one zone happens here, once, on the frame you cross the
   * border — not on a timer and not per frame. It reveals who holds the ground, starts its patrols on
   * the real road nodes, puts people on the road, sends a caravan if there is somewhere for one to go,
   * rolls for trouble, and builds the board.
   */
  function enterTerritory(zone) {
    boardZone = zone.id;
    const record = holdings.visit(zone.id);
    const cell = terrain.metresPerCell;
    const inZone = n => zones.at(n.x * cell, n.y * cell)?.id === zone.id;
    const nodes = (world.nodes || []).filter(inZone);
    const spot = n => ({ x: n.x * cell, z: n.y * cell, name: n.name || zone.name, kind: n.type, tags: [n.type] });

    // a patrol walks between real places: the zone's settlements, landmarks and passes
    const route = nodes.filter(n => ['settlement', 'port', 'landmark', 'pass'].includes(n.type)).map(spot);
    const stops = route.length >= 2 ? route
      : holdings.sitesIn(zone.id).map(si => ({ x: si.x, z: si.z, name: si.name }));
    if (stops.length >= 2) patrols.enter(zone, stops);

    // somebody on the road: junctions, landmarks and the sites themselves
    roadFolk.populate(zone, [
      ...nodes.map(spot),
      ...holdings.sitesIn(zone.id).map(si => ({ x: si.x, z: si.z, kind: 'road', tags: ['road', 'camp'] })),
    ], { night: sky.dayFraction < 0.25 || sky.dayFraction > 0.78, level: player.level });

    // and a load moving between two of its settlements
    const towns = nodes.filter(n => n.type === 'settlement' || n.type === 'port').map(spot);
    if (towns.length >= 2 && !trade.inZone(zone.id).length) trade.dispatch(zone, towns);

    // does anything happen to this place today?
    trouble.consider(zone, {
      biome: terrain.biomeAt(control.x, control.z).key,
      weather: blended.key,
      playerBeaten: !!campaign.nemesis,
    });

    // the board. Everything on it names something that is actually in this zone right now.
    const candidates = candidatesFrom({
      zone, territory: holdings, bestiary: bestiary.enemies || [], nodes: world.nodes || [],
      landmarks: holdings.landmarksIn(zone.id),
      npcs: roadFolk.candidates(zone.id),
      caravans: trade.candidates(zone.id),
      patrols: patrols.candidates(zone.id),
      named: campaign.nemesis ? [{ id: campaign.nemesis.id || 'nemesis', name: campaign.nemesis.name, state: 'grudge' }] : [],
      metresPerCell: cell, level: player.level,
    });
    localBoard = jobs.offer({ zone, level: player.level, candidates, want: 5 });

    // and one thing you now know about somewhere you have not been
    const neighbours = zones.list().filter(z => z.id !== zone.id && Math.abs(z.minLevel - zone.minLevel) <= 6);
    if (neighbours.length) {
      const pick = neighbours[Math.floor(Math.random() * neighbours.length)];
      rumours.hear(pick, { from: rumourSource(zone), extra: { unvisitedLandmarks: 2 } });
    }

    if (record?.holder) hud.log(`${zone.name} is held by ${intro.nameFor(record.holder)}.`, '');
    for (const row of trouble.describe(zone.id)) hud.log(`${zone.name}: ${row.blurb}.`, 'bad');
  }

  /**
   * A job off a notice board pays itself.
   *
   * Every other quest in the game is handed back to the person who gave it, and the talk screen does
   * the paying. A board job has no person — it came off a post in a village or out of somebody's
   * mouth on the road — so it would have sat at "done" for ever with nobody to give it to. It pays
   * on the frame it finishes, and the WORLD moves at the same time: the faction that posted it is
   * pleased, whoever holds the ground feels it, and it leaves a rumour behind.
   */
  function payBoardJobs() {
    for (const quest of [...questLog.active]) {
      if (!quest.done || !quest.frame) continue;
      const reward = questLog.turnIn(quest);
      markers.syncQuests(questLog.active);
      player.gold += reward.gold;
      const levels = rpg.gainXp(player, reward.xp);
      hud.log(`${quest.title} — done. ${reward.gold} gold, ${reward.xp} xp.`, 'good');
      sound.questDone();
      if (levels) hud.log(`Level ${player.level}!`, 'level');
      const out = jobs.complete(quest);
      if (out.rumour) {
        rumours.add(out.rumour, { zone: zones.byId(quest.zoneId), from: 'word going round' });
        hud.log(out.rumour + '.', '');
      }
      if (out.flipped) {
        hud.log(`${quest.zoneName} belongs to ${intro.nameFor(out.flipped.to)} now.`, 'level');
      }
      hud.setPlayer(player);
      autoSave();
    }
  }

  /**
   * Every rank reward you have actually earned, keyed by its effect.
   *
   * `data/faction-rewards.json` was loaded and read by nothing. This is the one place that asks it,
   * so a caller can say `earnedRewards().freeTolls` and not care which faction it came from.
   */
  function earnedRewards() {
    const out = {};
    for (const [key, list] of Object.entries(rewardData.rewards || {})) {
      const value = standings.get(key);
      for (const row of list) {
        const at = (rewardData.ranks || []).find(r => r.key === row.rank)?.at ?? 999;
        if (value < at) continue;
        for (const [effect, amount] of Object.entries(row.effect || {})) out[effect] = amount;
      }
    }
    return out;
  }

  /**
   * What a shop charges: the campaign's own multiplier, times how the people who hold this ground
   * feel about you.
   */
  function shopMult() {
    const base = campaign.priceMultiplier(talk.npc?.node?.id);
    const key = holdings.of(hud.here?.id)?.holder;
    // …and what is happening here: short rations put every price up, a fair day takes them down
    const earned = earnedRewards();
    // the Greenhand feed everybody at half price once you are one of theirs
    const ration = earned.rationPrice ? (earned.rationPrice + 1) / 2 : 1;
    return base * (key ? standings.priceMult(key) : 1) * (zoneEffects.shopMult || 1) * ration;
  }

  /** A faction's own colour, for a minimap mark or a row on the standing screen. */
  function factionColour(key) {
    return (factionData.factions || []).find(f => f.key === key)?.colour || null;
  }

  /**
   * What the trouble in this zone is actually doing.
   *
   * `trouble.effects()` was written and never called, so an incident was one red line in the log and
   * changed nothing. It is read here once a tick and applied to the two things a player feels: how
   * much is out there, and what a shop charges.
   */
  let zoneEffects = { ...NO_EFFECT };
  let lastBudget = null;
  function applyIncidents() {

    zoneEffects = hud.here ? trouble.effects(hud.here.id) : { ...NO_EFFECT };
    /**
     * C11: the starting band is thinner than the rest.
     *
     * Fighting a kilometre outside town at level 1 took a character from 94 health to 30 in about
     * seven seconds with thirty-three things alive in the field. A moor hound is seven swings; three
     * arriving together is a death you cannot answer. The first band gets half the crowd, and the
     * rest of the world is unchanged.
     */
    const soft = hud.here && (hud.here.minLevel ?? 1) <= 4 ? 0.5 : 1;
    const want = Math.round((spawnCfg.maxAlive ?? 38) * zoneEffects.spawnMult * soft);
    if (want !== lastBudget) { lastBudget = want; field.setBudget?.(want); }
  }

  /** The world moving while you are in it. Cheap enough to run twice a second. */
  let lastPhase = null;
  function tickTerritory(seconds) {
    applyIncidents();
    payBoardJobs();
    const night = sky.dayFraction < 0.25 || sky.dayFraction > 0.78;
    /**
     * Different people are on the road at night, and different people again tomorrow.
     *
     * The roster is cached per zone per phase so it does not churn while you stand there, which means
     * something has to clear it — otherwise the same pedlar stands on the same stretch of road for
     * the whole run. Dusk and dawn are the two moments it is reasonable for the road to change.
     */
    const phase = night ? 'n' : 'd';
    if (lastPhase !== null && phase !== lastPhase && hud.here) {
      roadFolk.refresh(hud.here.id);
      boardZone = null;          // and the board is rebuilt with whoever is out there now
    }
    lastPhase = phase;
    patrols.update(seconds, { night });
    for (const event of trade.update(seconds, { playerNear: { x: control.x, z: control.z } })) {
      if (event.kind === 'caravan-wrecked') hud.log(`${event.name} never arrived.`, 'bad');
      if (event.kind === 'caravan-arrived') hud.log(`${event.name} got through.`, 'good');
      if (event.kind === 'caravan-attacked') hud.log(`${event.name} is under attack.`, 'bad');
    }
    // in-game hours, from the same clock the day/night cycle runs on
    for (const event of holdings.tick(seconds / 60)) {
      if (event.kind === 'zone-changed-hands') {
        hud.log(`${zones.byId(event.zoneId)?.name || 'The ground'} belongs to ${intro.nameFor(event.to)} now.`, 'level');
      }
      if (event.kind === 'incident-over') {
        // the aftermath, which is the interesting half — `onExpire` was data nothing ever read
        const spec = trouble.byKind(event.incident);
        const line = spec?.onExpire?.rumour;
        if (line) {
          const text = line.replace(/\{zone\}/g, event.zoneName || 'the place');
          rumours.add(text, { zone: zones.byId(event.zoneId), from: 'word going round' });
          hud.log(text + '.', '');
        }
        if (spec?.onExpire?.grip) holdings.press(event.zoneId, spec.onExpire.grip);
      }
    }
  }

  // ---------------------------------------------------------------- saving
  const saveId = save?.id || saves.newId();
  let sinceSave = 0;
  function currentSnapshot() {
    return snapshot({
      id: saveId, name: player.name, seed, classId, player, control,
      // where you actually are, so a load does not drop you back at the starting star
      at: { systemSeed, starId, planetId: planet.id, starName: star.name, planetName: planet.name },
      elapsed: state.elapsed, playtime: state.playtime,
      markers: markers.toJSON(),
      place: features.settlementAt(control.x, control.z)?.name || terrain.regionAt(control.x, control.z) || terrain.biomeAt(control.x, control.z).name,
      weather: blended.key,
      quests: questLog.toJSON(),
      campaign: campaign.toJSON(),
      passiveRanks: player.passiveRanks,
      pendingPassive: player.pendingPassive,
      pendingTalent: player.pendingTalent,
      materials: craft.materials.toJSON(),
      dungeonsCleared,
      world: worldOpts,
      // a save taken underground is in the dungeon's own coordinates — carry the way back out
      inDungeon: !!dungeon,
      surface: surfaceSpot,
      // The Territory: who likes you, what you have knocked over, and what you have heard
      standings: standings.toJSON(),
      territory: holdings.toJSON(),
      rumours: rumours.toJSON(),
      waypoints: waypoints.toJSON(),
      // the bases, which belong to the CHARACTER and not to any one world
      homes: homes.toJSON(),
      // what the crates are holding, and what the grid is carrying
      stores: stores.toJSON(),
      grid: grid.toJSON(),
      // which seams you have worked out, and the drills and routes standing on them
      ore: ore.toJSON(),
      mining: mining.toJSON(),
      // the benches, their queues, and the recipes you have unlocked by doing them
      works: works.toJSON(),
      // §7 — the raid you took on, and how far through it you are
      defence: defence.toJSON(),
      /**
       * THE BASE IS PART OF THE SAVE.
       *
       * `snapshot()` destructures a fixed argument list, and its own comment records what happened
       * the last time something was left off it — `world`, `quests` and `campaign` were silently
       * dropped and every load emptied them. So each of these is added here AND in save.js's
       * parameter list, together.
       */
      terraform: terraform.toJSON(),
      build: build.toJSON?.() || null,
      portal: portals.toJSON?.() || null,
      colony: colony.toJSON?.() || null,
      farm: farm.toJSON?.() || null,
      work: board.toJSON?.() || null,
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
      // LOCAL time. The sun's angle is `elapsed/dayLength + startFraction + longitude`, so a
      // "Midnight" button that ignored longitude gave midnight at the left edge of the map and
      // whatever-o'clock wherever you were actually standing.
      const longitude = control.x / terrain.widthM;
      state.elapsed = (((fraction - startFraction - longitude) % 1) + 1) % 1 * dayLength;
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
      const item = attuneWeapon(rpg.loot.generate(field.rng.pick(bases), rarity, 'high', { rng: rpg.rng }));
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

  // ---------------------------------------------------------------- the pause menu
  //
  // Escape used to only close whatever was open and then do nothing, which left no way out of the
  // game except the browser's back button. Now it steps back through the panels and, when there is
  // nothing left to close, opens a menu: resume, settings, save, main menu — and the control list,
  // which used to sit permanently across the bottom of the screen on top of the log.
  const pauseMenu = {
    get isOpen() { return !$('pause').classList.contains('hidden'); },
    toggle(open = !pauseMenu.isOpen) {
      $('pause').classList.toggle('hidden', !open);
      if (open) {
        input.release();
        $('pause-where').textContent = dungeon
          ? `${dungeon.name} · level ${dungeon.level}`
          // "0m" sat four inches from "93 m" of altitude, meaning something else entirely
          : `${planet.name} · ${zones.at(control.x, control.z)?.name || ''} · ${state.playtime < 60 ? 'just landed' : playtimeText(state.playtime) + ' played'}`;
        drawKeyHint();
      }
      return open;
    },
  };
  /**
   * The control list says the keys you actually have.
   *
   * D15 made every key rebindable, at which point a hard-coded "M map" in the markup becomes a lie
   * the moment somebody moves it — and the pause menu is the one place a player goes to find out
   * what to press. Built from `settings.bindings` each time the menu opens, so it is right even if
   * the binding changed a second ago. `KEY_HELP` stays in js/player.js as the fallback for anything
   * that wants one string and has no settings object.
   */
  function drawKeyHint() {
    const hint = $('hint');
    if (!hint || !settings?.bindings) return;
    const parts = settings.bindings.map(b => {
      const code = settings.keyFor(b.action);
      // a default you moved away from and never reused does nothing at all; say so rather than
      // printing a key that is not bound
      return code
        ? `<b>${settings.keyLabel(code)}</b> ${b.name}`
        : `<span class="dim">${b.name} unbound</span>`;
    });
    hint.innerHTML = `${parts.join(' · ')}<br><span class="dim">in space: W fly · Shift boost · `
      + 'hold Space warp · J land</span>';
  }

  $('pause-resume').onclick = () => pauseMenu.toggle(false);
  $('pause-settings').onclick = () => { pauseMenu.toggle(false); settings.toggle(true); };
  $('pause-save').onclick = () => { autoSave({ quiet: false }); pauseMenu.toggle(false); };
  $('pause-menu').onclick = () => { autoSave(); location.href = location.pathname; };

  // ---------------------------------------------------------------- keys that are not movement
  window.addEventListener('keydown', e => {
    // Tab OPENS the sheet; once it is open Tab has to move focus, or keyboard navigation inside the
    // sheet closes it on the first press. (Nothing in the old sheet was reachable by keyboard, which
    // is the only reason this was not noticed.)
    if (e.code === 'KeyI' || (e.code === 'Tab' && !hud.sheetOpen)) {
      e.preventDefault(); pauseMenu.toggle(false); hud.toggleSheet();
    }
    /**
     * B IS BUILD MODE.
     *
     * "How does build mode work? How do I start building a base?" — it starts here. B puts the ghost
     * up, the mouse wheel turns it, click puts it down, Enter finishes a run of wall or road, and
     * Ctrl+Z takes back the last thing. Everything else is on screen while the mode is up.
     */
    if (e.code === 'KeyB' && !hud.sheetOpen && !map.isOpen && !talk.isOpen) {
      e.preventDefault();
      const on = !build.mode;
      build.setMode(on);
      buildUI.setOpen(on);
      hud.log(on
        ? 'Build mode. Scroll to turn · click to place · Enter to finish a run · Ctrl+Z to undo · B to stop.'
        : 'Build mode off.', on ? 'level' : '');
    }
    if (build.mode) {
      if (e.code === 'Enter') { e.preventDefault(); build.finishRun?.(); }
      if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); build.undo?.(); }
      if (e.code === 'Escape') { e.preventDefault(); build.setMode(false); buildUI.setOpen(false); }
      // the brush is the terrain tools' whole interface; it needs a size you can change
      if (e.code === 'BracketLeft') { e.preventDefault(); build.setRadius(build.radius - 2); }
      if (e.code === 'BracketRight') { e.preventDefault(); build.setRadius(build.radius + 2); }
    }
    if (e.code === 'KeyM') {
      e.preventDefault();
      pauseMenu.toggle(false);
      // "Pressing M for map while outside of a planet should instead open a galaxy map." A world
      // map of a planet you are not standing on is no use; the chart is.
      // B9: in the atmosphere M is the PLANET map, not the star chart — you are over ground, so the
      // ground is what you want to look at. map.js had a capture-phase listener standing in for this
      // while main.js was another agent's file; that workaround is gone now.
      if (mode === 'ground' || mode === 'air') map.toggle();
      else { if (map.isOpen) map.toggle(false); chart.toggle(); }
    }
    if (e.code === 'KeyO') { e.preventDefault(); pauseMenu.toggle(false); settings.toggle(); }
    if (e.code === 'Escape') {
      e.preventDefault();
      if (settings.isOpen) settings.toggle(false);
      else if (talk.isOpen) talk.close();
      else if (hud.sheetOpen) hud.toggleSheet(false);
      else if (map.isOpen) map.toggle(false);
      else if (chart.isOpen) chart.toggle(false);
      else pauseMenu.toggle();                      // nothing left to close: the menu
      regrab();
    }
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
  let fighting = false;
  let lastAirLod = -1;
  let torchWanted = true;
  // cleared at dawn, so the hint below is once per planetary day rather than once per session
  let nightHintShown = false;
  /** Are you holding something that burns? The starting torch sits in the off hand. */
  function carryingLight() {
    const lamp = player.equipment.light;
    return !!(lamp?.light || lamp?.baseKey === 'torch' || player.equipment.offhand?.light);
  }
  // panels own the mouse while they are open: the canvas must not grab it back on the next click
  // one predicate, so the mouse and the clock never disagree about whether a panel is up
  input.setBlocked(() => panelOpen() || debug.isOpen);

  function tick() {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, clock.getDelta());
    if (state.paused) return;
    if (uiPaused()) {
      // Drain the input queue while we are stopped, or every key tapped with the map open fires the
      // instant it closes. The panels themselves are driven by their own keydown handlers, so they
      // keep working.
      input.sample();
      state.uiPaused = true;
      return;
    }
    state.uiPaused = false;
    state.elapsed += dt;
    state.playtime += dt;
    state.frames++;

    const snap = input.sample();
    /**
     * A CLICK IN BUILD MODE IS NOT A SWING.
     *
     * The controller runs its own attack clock off `snap.attack`, so suppressing the swing in the
     * frame loop was not enough — the arm still came up and the swing timer still ran, which reads
     * as the character taking a swipe at the fence post they are placing. The button is taken away
     * from the controller entirely while the mode is up.
     */
    if (build.mode) { snap.attack = false; snap.attackHeld = false; }

    // J is the ship: board it on the ground, put it down in space
    if (snap.pressed?.has('KeyJ')) {
      // ground: board. air: set down. space: come down to whatever you are pointing at.
      if (mode === 'ground') launch();
      else if (mode === 'air' || mode === 'space') land();
    }
    if (mode !== 'ground') {
      hud.skills(null);
      sunfx.hide();
      if (mode !== 'space') hud.reticles(null);
      stepFlight(dt, snap);
      if (state.frames % 12 === 0) chart.tick();   // the system view has planets moving on it
      renderFrame();
      return;
    }

    // E: open a chest, go down into a dungeon, come back up, or talk to somebody
    if (snap.pressed?.has('KeyE')) {
      if (talk.isOpen) { talk.close(); regrab(); }
      else {
        const it = interactTarget();
        if (!it) hud.log('Nothing here to do.');
        else if (it.kind === 'chest') openChest(it.chest);
        else if (it.kind === 'dungeon') enterDungeon(it.gate);
        else if (it.kind === 'leave') leaveDungeon();
        else if (it.kind === 'wanderer') meetOnTheRoad(it.met);
        else if (it.kind === 'landmark') atLandmark(it.mark);
        // the town's notice board: the one place work is taken from now
        else if (it.kind === 'board') hud.openNoticeBoard({ where: it.town.name });
        /**
         * E ON A SEAM TAKES A SWING AT IT.
         *
         * One press is one swing rather than a channel, so it reads like the rest of the game's E.
         * The report afterwards is the point of §1: it says what you got AND what it would deliver
         * per minute from where you are standing, which is the rich-and-far trade-off in one number.
         */
        else if (it.kind === 'bell') {
          const st = defence.standing();
          if (!st.state || st.state === 'won' || st.state === 'lost' || st.state === 'declined') {
            const offer = defence.offer({ level: player.level, biome: terrain.biomeAt(control.x, control.z).key });
            if (!offer.ok) hud.log(offer.why, 'warn');
            else {
              hud.log(`${offer.tier.name}: ${offer.waves.length} waves. Press E again to take it on.`, 'level');
            }
          } else if (st.state === 'offered') {
            defence.accept({ at: state.elapsed });
          } else if (st.state === 'accepted') {
            defence.ring({ hour: sky.dayFraction * 24, at: state.elapsed, level: player.level });
            // `ring` spawns the first wave itself, at the base — see defence.spot()
          } else {
            hud.log('They are already at the wall.', 'bad');
          }
        }
        else if (it.kind === 'seam') {
          const out = mining.swing(it.seam, 1.6, { tool: toolTierFor(player) });
          if (out.got <= 0) hud.log(out.why ? `You cannot work this: ${out.why}.` : 'Nothing comes loose.', 'warn');
          else {
            const name = (resourceData?.materials?.[out.resource]?.name || out.resource).toLowerCase();
            hud.log(`${out.got.toFixed(1)} ${name}${out.intoPool ? ' into the store beside you' : ''}.${out.depleted ? ' The seam is worked out.' : ''}`, 'good');
            sound.ui('click');
          }
        }
        else if (it.kind === 'portal') {
          const out = portals.use?.(it.end);
          if (out?.ok) {
            control.teleport(out.to.x, out.to.z);
            rebuildWorldAround(true);
            field.clear();
            hud.log('You step through.', 'level');
            autoSave();
          } else if (out?.why) hud.log(out.why, 'bad');
        }
        else if (it.kind === 'talk') {
          // phase 7: what they say comes from Lingo and their own personality, not a fixed string
          const who = it.who;
          speech.attach(who);
          who.greeting = speech.line(who, 'greet', { listener: { name: player.name } });
          sound.ui('open');
          talk.show(who, talkContext(who));
          speech.say(who, who.greeting);
        }
      }
    }
    /**
     * L IS THE LIGHT — on foot and in the ship.
     *
     * It was F, and the user asked for one key that means "light" wherever you are: "let's also
     * allow the light when on foot to be toggled on both with the hotkey L for light". The log moved
     * to K to make room. The lamp can only be lit while you are actually carrying one; the ship's
     * spotlights are part of the ship, so they have nothing to carry.
     */
    if (snap.pressed?.has('KeyL')) {
      if (!carryingLight()) hud.log('You have nothing to light. A torch or a lantern goes in the off hand.');
      else {
        torchWanted = !torchWanted;
        hud.log(torchWanted ? 'You light your lamp.' : 'You snuff your lamp.');
        nightHintShown = true;            // they know where the key is now; stop offering
      }
    }
    light.setTorch(torchWanted && carryingLight());

    /**
     * ONCE A NIGHT, tell them the key exists.
     *
     * "At night, if your light is off, there should be a chat hint press L to turn the light on,
     * shown only once per planetary day." Once per day means per planetary day, so the flag is
     * cleared when the sun comes back up rather than on a timer — on a world with a six-minute day
     * that is six minutes, and on a slow one it is not nagging every few seconds either way.
     */
    const dark = sky.isNight;
    if (!dark) nightHintShown = false;
    else if (!nightHintShown && !torchWanted && carryingLight() && !panelOpen()) {
      nightHintShown = true;
      hud.log('It is dark. Press L to light your lamp.', 'level');
    }

    const frozen = hud.sheetOpen || debug.isOpen || map.isOpen || talk.isOpen || settings.isOpen || rewardsOpen() || pauseMenu.isOpen;

    /**
     * G GETS ON AND OFF WHATEVER YOU BUILT.
     *
     * H is the horse and G is the machine, because they are genuinely different things: the horse
     * climbs and swims badly, the motorcycle does neither and does not care about the hill until it
     * does. Nothing to ride is said out loud — a key that does nothing silently is a key nobody
     * presses twice.
     */
    if (!frozen && snap.pressed?.has('KeyG')) {
      const owned = player.vehicles?.owned?.ground || [];
      if (!owned.length) hud.log('You have nothing to drive. Build one at an assembler.');
      else if (control.swimming) hud.log('Not in the water.');
      else if (control.driving) {
        control.driving = null;
        selectGroundVehicle(player, null);
        rig.hide();
        hud.log('You step off.');
      } else {
        // the best one you own, unless you have chosen otherwise
        const key = player.vehicles.active?.ground || [...owned].sort(
          (a, b) => GROUND_LADDER.indexOf(b) - GROUND_LADDER.indexOf(a))[0];
        selectGroundVehicle(player, key);
        control.mounted = false;
        control.driving = { speed: 0 };
        rig.show(modelFor(key) || key);
        hud.log(`You get on the ${GROUND_VEHICLES[key].name.toLowerCase()}. Shift is the throttle.`);
      }
    }


    // V is first person: the head comes off the model, not just the camera
    if (!frozen && snap.pressed?.has('KeyV')) setFirstPerson(!control.firstPerson);

    // skills on 1-6 — not while a panel has the keyboard
    if (!frozen && snap.pressed?.size) {
      for (let i = 0; i < 6; i++) if (snap.pressed.has(`Digit${i + 1}`)) { castSkill(i); break; }
    }

    /**
     * THE THREE CONDITIONAL AFFIXES NOBODY TOLD ABOUT THE WORLD.
     *
     * `cond_nightWard` reads `unit.atNight`, `cond_watch` reads `unit.moving`, and
     * `cond_vehicleDmg` reads `self.mounted` — and nothing ever set the first two on the player, so
     * "+18% armour after dark" and "+2 health a second while standing still" were true only in the
     * tooltip. They go on before the sheet is derived, not after.
     */
    {
      const night = sky.dayFraction < 0.25 || sky.dayFraction > 0.78;
      const still = control.moving <= 0.05;
      if (player.atNight !== night || (player.moving > 0) === still) {
        player.atNight = night;
        player.moving = still ? 0 : 1;
        rpg.refresh?.(player);
      }
    }

    // haste is a real stat: keep the controller's swing clock in step with it
    control.attackEvery = player.derived.attackEvery ?? (balance.player?.attackEvery ?? 0.62);
    /**
     * …and each HAND keeps its own rhythm, because a dagger and a greatsword do not swing at
     * the same speed and a dual-wielder swings both. `haste` scales whatever the weapon's own
     * pattern says; see js/weapons.js.
     */
    {
      const hands = handsOf(player);
      const hasteK = control.attackEvery / (balance.player?.attackEvery ?? 0.62);
      control.dualWield = hands.dual;
      control.mainEvery = strikeAt(hands.main, control.mainStep).every * hasteK;
      control.offEvery = hands.dual ? strikeAt(hands.off, control.offStep).every * hasteK : null;
    }
    const step = control.update(dt, snap, { frozen });

    if (step.mountChanged) {
      if (control.mounted && !player.equipment.mount) {
        // you cannot ride what you do not have — the mount slot is the thing that makes H work
        control.mounted = false;
        hud.log('You have nothing to ride. A mount goes in the mount slot.');
      } else {
        if (control.mounted) buildMount();     // the slot may have changed since the last ride
        hud.log(control.mounted ? `You swing up onto the ${(player.equipment.mount?.name || 'horse').toLowerCase()}.` : 'You dismount.');
      }
      if (horse) horse.group.visible = control.mounted;
    }
    if (step.enteredWater && !step.boarded) hud.log('You wade in and start swimming.');
    if (step.boarded) hud.log(`You put the ${step.boarded.name} in the water.`);
    if (step.leftBoat) hud.log(`You haul the ${step.leftBoat.name} up the bank.`);

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

    /**
     * THE STRIDE HAS TO MATCH THE GROUND.
     *
     * "Can you make the character walking animation fixed? He doesn't walk, but my minions do."
     *
     * The legs were moving the whole time — checked the bones, they swing 0.7 rad, and the mesh is
     * properly skinned to them. The fault is that a walk cycle is a fixed 1.05 seconds while the
     * body covers 5.4 metres in that second: a 2.7 metre stride on a character a metre and a bit
     * tall. The feet skate, and a model gliding with its knees moving does not read as walking. The
     * companions never had the problem because a creature's gait is driven from its own speed.
     *
     * So the clip is played at the rate the body is actually travelling. `STRIDE` is how far one
     * full cycle should carry you; the clamp inside `setRate` keeps a sprint from turning into a
     * blur and a crawl from stopping dead.
     */
    if (actor.setRate) {
      const cycle = control.running ? 0.65 : 1.05;          // the clip's own length, chibi2-motion.js
      const STRIDE = control.running ? 3.4 : 2.0;           // metres one cycle should cover
      const moving = control.moving > 0.15 && control.grounded && !control.mounted && !control.driving;
      actor.setRate(moving ? (control.moving * cycle) / STRIDE : 1);
    }
    actor.update(dt);

    if (horse) horse.group.visible = control.mounted;
    if (horse && control.mounted) {
      horse.group.position.set(control.x, control.y, control.z);
      horse.group.rotation.y = control.yaw;
      horse.setAnim(control.moving > 6 ? 'run' : control.moving > 0 ? 'walk' : 'idle');
      horse.update(dt);
    }

    /**
     * THE MACHINE UNDER YOU, and the fuel it is drinking.
     *
     * `speedOn` is asked every frame rather than once, because the answer changes with the ground:
     * a motorcycle is quick on a road, wallows off it, and simply stops at a bank it cannot climb.
     * `drive()` burns the fuel for the metres actually covered and wears the thing out, and when
     * the tank runs dry it says so once and puts you on your feet.
     */
    if (control.driving) {
      const spec = driveFor(player);
      if (!spec) { control.driving = null; rig.hide(); }
      else {
        const onRoad = terrain.roadAt(control.x, control.z) > 0.45;
        const slope = terrain.slopeAt(control.x, control.z, 3);
        const surface = onRoad ? 'road' : terrain.biomeAt(control.x, control.z).key;
        const moved = driveVehicle(player, control.moving * dt, materials, { surface, slope });
        control.driving = { speed: moved.speed || 0 };
        if (moved.dry || !moved.moving) {
          hud.log(moved.why || `The ${spec.name} stops.`, 'warn');
          control.driving = null;
          selectGroundVehicle(player, null);
          rig.hide();
        } else {
          rig.place(control.x, terrain.heightAt(control.x, control.z), control.z, control.yaw);
          rig.update(dt, control.moving, -snap.strafe || 0);
          // you are ON it, so the walking body is put away exactly as the horse does
          actor.group.visible = false;
          hidForRig = true;
        }
      }
    } else if (hidForRig) {
      /**
       * Got off, ran out of fuel, or waded into a river — whichever it was, the body comes back.
       *
       * Gated on a flag WE set rather than on "the actor is hidden and we are on the ground",
       * because the ship hides it too and a frame where both are true would put the walking
       * character back inside the cockpit.
       */
      hidForRig = false;
      actor.group.visible = true;
      rig.hide();
    }

    /**
     * And the boat, which nobody asked for by name.
     *
     * "Boats should automatically equip when you start swimming" — so there is no key and no slot to
     * manage; js/player.js boards on the way in. All this does is put the hull where the controller
     * says you are. It sits on `waterSurface` rather than `control.y`, because while swimming `y` is
     * the body's height, which is UNDER the surface — a boat drawn there floats like a submarine.
     */
    if (control.boating) {
      boat.show(control.boating.key);
      boat.place(control.x, control.waterSurface, control.z, control.yaw);
      boat.update(dt, control.moving);
    } else {
      boat.hide();
    }

    // --- attacking
    /**
     * ONE SWING, of whichever hand swung.
     *
     * A weapon is a PATTERN now, not a number: the strike that comes out depends on how far into
     * its sequence you are, and each shape has its own reach, arc, damage share and splash. A
     * greatsword sweeps then comes down overhead; a rapier thrusts; a dagger jabs twice and slashes.
     * `derived.areaPct` widens all of it at once, and the drawn arc is scaled by the same number so
     * what you see is what hits.
     */
    const swingWith = (hand, stepIndex) => {
      const hands = handsOf(player);
      const weapon = hand === 'off' ? hands.off : hands.main;
      const share = hand === 'off' ? OFFHAND_DAMAGE : 1;
      const shape = withArea(strikeAt(weapon, stepIndex), player.derived.areaPct || 0);
      const reach = shape.reach;
      const arc = shape.arc;
      // What this weapon is made of. A wand throws its element; a branded sword carries it into the
      // swing. Both go through `magicResist` instead of armour and leave their status behind.
      const element = elementOf(weapon);
      const leaves = statusOf(weapon);
      const brandHit = (enemy, result) => {
        if (leaves && skillData.statuses[leaves] && result?.amount > 0) {
          landStatus(leaves, skillData.statuses[leaves], enemy, Math.max(1, result.amount * 0.7));
        }
        reportHit(enemy, result);
      };
      const meleeOpts = {
        element, onHit: brandHit, applyStatus: statusHook,
        // the field calls this `power`: the off hand hits for less, and each strike shape has its
        // own share of a full hit
        power: share * shape.damage,
      };

      if (isStaff(weapon)) {
        /**
         * A STAFF DOES NOT SWING. Its attack is a close-range spell, free to cast, chosen from its
         * element's own list — "replace the auto attacks with a close range spell… this eventually
         * acts like an additional spell but does not require mana to use".
         */
        const spell = staffSpell(weapon, element);
        const a = aim();
        const base = Math.max(1, Math.round((player.derived.damage[1] || 6) * (spell.mult || 1) * share));
        const radius = (spell.radius || spell.width || 3) * shape.scale;
        sound.combat('cast');
        spellfx.cast({ at: new THREE.Vector3(control.x, control.y + 1.1, control.z), element, scale: shape.scale });
        if (spell.shape === 'nova') {
          spellfx.aoe({ at: new THREE.Vector3(control.x, control.y + 0.2, control.z), element, radius, scale: shape.scale });
          for (const { enemy, result } of field.strikeArea(control.x, control.z, radius, player, { falloff: 0.35, element, power: share * (spell.mult || 1) })) {
            brandHit(enemy, result);
            if (spell.status) landStatus(spell.status, skillData.statuses[spell.status], enemy, Math.max(1, base * 0.6));
          }
        } else if (spell.shape === 'cone' || spell.shape === 'wave') {
          const range = (spell.range || 9) * shape.scale;
          const wide = spell.shape === 'cone' ? (spell.arc || 0.9) * shape.scale : 0.45;
          fx.swipe({ x: control.x, y: control.y, z: control.z, yaw: control.yaw, reach: range, arc: wide });
          for (const { enemy, result } of field.strike(control, player, { reach: range, arc: wide, ...meleeOpts })) {
            if (spell.status) landStatus(spell.status, skillData.statuses[spell.status], enemy, Math.max(1, base * 0.6));
          }
        } else {
          // lob, ground and chain all leave the hand as a bolt and do their work where they land
          const plan = talentPlan(player, 'staff:' + spell.key, {
            element, range: (spell.range || 12) * shape.scale, splash: radius,
            projectiles: 1, spread: 0,
            status: spell.status || leaves,
            statusSpec: (spell.status || leaves) ? skillData.statuses[spell.status || leaves] : null,
          });
          const from = new THREE.Vector3(a.x + a.dx * 0.6, a.y - 0.1, a.z + a.dz * 0.6);
          fireBolt(plan, a, a.dx, a.dy, a.dz, { ...meleeOpts, power: spell.mult || 1 }, from, true);
        }
        control.swing = Math.max(control.swing, 0.32);
        return;
      }

      if (weapon?.castElement && weapon?.ranged) {
        /**
         * A WAND. Every wand throws a bolt, and what the bolt DOES is what makes one different from
         * the next — "update wands so each one also has a projectile effect, area, chain/bounce,
         * explosion, multi-shot". The behaviour is decided once from the item's own id, so a given
         * wand always behaves the same way.
         */
        const how = wandBehaviour(weapon);
        const a = aim();
        const from = new THREE.Vector3(a.x + a.dx * 0.6, a.y - 0.15, a.z + a.dz * 0.6);
        const plan = {
          element, range: (weapon.castRange ?? 34) * (how.slow ? 0.85 : 1),
          splash: (how.splash ?? 2.2) * shape.scale,
          projectiles: how.projectiles || 1, spread: how.spread || 0,
          chains: how.chains || 0, homing: how.homing || 0,
          status: leaves, statusSpec: leaves ? skillData.statuses[leaves] : null,
        };
        sound.combat('bow');
        fireBolt(plan, a, a.dx, a.dy, a.dz, { ...meleeOpts, power: (how.mult || 1) * share }, from, true);
        control.swing = Math.max(control.swing, 0.3);
        return;
      }

      if (weapon?.ranged) {
        // A bow aims where the CROSSHAIR is, not where the body is pointing — see aim(). Using the
        // body's facing meant every arrow flew flat (fixed in round 3) and, once the camera moved
        // over the shoulder, a shoulder's width to the right of the reticle (fixed in round 4).
        const a = aim();
        const ax = a.dx, ay = a.dy, az = a.dz;
        const eyeY = a.y;
        const range = balance.player?.arrowRange ?? 46;
        // a quiver decides how many arrows leave and what they do when they land
        const shots = Math.max(1, Math.round(player.derived.arrowsPerShot || 1));
        const spread = shots > 1 ? 0.08 : 0;
        sound.combat('bow');
        for (let i = 0; i < shots; i++) {
          const t = shots === 1 ? 0 : (i / (shots - 1) - 0.5) * 2;
          const yaw = Math.atan2(ax, az) + t * spread;
          const dx = Math.sin(yaw) * Math.hypot(ax, az), dz = Math.cos(yaw) * Math.hypot(ax, az);
          const arrow = fx.shoot({
            x: control.x + dx * 0.7, y: eyeY + ay * 0.5, z: control.z + dz * 0.7,
            dirX: dx, dirY: ay, dirZ: dz,
            range, speed: balance.player?.arrowSpeed ?? 42,
          });
          /**
           * A QUIVER DECIDES WHAT AN ARROW DOES, AND NOTHING WAS ASKING IT.
           *
           * `arrowsPerShot` was read; `arrowHoming` and `arrowBurst` were derived off the quiver
           * affixes, stored on the sheet, and never looked at again — so two of the three quiver
           * powers in the game did nothing at all.
           *
           * Homing widens the shot's own hit test rather than steering the model: an arrow that
           * curves is a projectile simulation, and what the affix promises ("arrows steer toward
           * whatever you aimed at") is that you hit the thing you were pointing at.
           */
          const homing = player.derived.arrowHoming || 0;
          const target = field.hitScan(control.x, eyeY, control.z, dx, ay, dz, {
            range, width: 1.1 + homing * 2.6,
          });
          if (target && arrow) arrow.range = Math.min(arrow.range, target.distance);
          // and a bursting arrow catches everything standing around what it hit
          const burst = player.derived.arrowBurst || 0;
          if (target && burst > 0) {
            const at = target.enemy || target;
            for (const { enemy, result } of field.strikeArea(at.x, at.z, burst, player, { falloff: 0.4, power: 0.55 })) {
              if (enemy !== at) brandHit(enemy, result);
            }
            spellfx.impact({ at: new THREE.Vector3(at.x, (at.y || 0) + 0.9, at.z), element: 'physical' });
          }
        }
        return;
      }

      // a swing: the white arc IS the hit box — same reach, same angle, same shape as the strike
      fx.swipe({ x: control.x, y: control.y, z: control.z, yaw: control.yaw, reach, arc });
      const hits = field.strike(control, player, { reach, arc, ...meleeOpts });
      sound.combat(hits.length ? 'hit' : 'swing', { crit: hits.some(h => h.result.crit) });
      // a branded weapon flashes its element on every body it lands on
      if (element !== 'physical') {
        for (const h of hits) spellfx.impact({ at: new THREE.Vector3(h.enemy.x, h.enemy.y + 0.9, h.enemy.z), element, crit: h.result.crit });
      }
      // `sunder` from the perk forest: the third strike of a pattern strips armour for good
      if (player.perkFlags?.sunder && shape.last) {
        for (const h of hits) h.enemy.armor = Math.max(0, (h.enemy.armor || 0) - 8);
      }
      // and a little splash behind the arc, scaled by the strike's own shape and the area stat
      const splash = (balance.player?.meleeSplash ?? 1) * (shape.splash || 1);
      if (splash > 0) {
        const [dx, dz] = control.facing();
        const already = new Set(hits.map(h => h.enemy));
        for (const { enemy, result } of field.strikeArea(control.x + dx * reach * 0.6, control.z + dz * reach * 0.6, splash, player, { falloff: 0.3, element, power: share * shape.damage })) {
          if (!already.has(enemy)) brandHit(enemy, result);
        }
      }
    };

    /**
     * A CLICK IN BUILD MODE BUILDS. IT DOES NOT SWING.
     *
     * Nothing was calling `build.confirm()` at all: every key worked, the ghost tracked the ground,
     * and clicking drew a sword. `buildClicks` is filled by the listener on the canvas rather than
     * read off `step.attacked`, because a swing is rate-limited by attack speed and putting a fence
     * post down should not be.
     */
    if (buildClicks > 0) {
      for (let i = 0; i < buildClicks; i++) {
        const res = build.confirm();
        if (res && res.ok === false && res.why) hud.log(res.why, 'warn');
      }
      buildClicks = 0;
      buildUI.refresh();
    } else if (!build.mode) {
      if (step.attacked) swingWith('main', step.step || 0);
      if (step.attackedOff) swingWith('off', step.offStep || 0);
    }

    field.update(dt, control, player, {

      onStatusDamage: (e, amount) => {
        if (amount > 0.6) hud.log(`${e.name} takes ${amount.toFixed(0)}.`);
      },
      onBossPhase: (e, phase) => {
        hud.log(phase.say || `${e.name} changes.`, 'bad');
        sound.combat('death', { beast: true });
      },
      onEnemyStrike: e => {
        // it may go for a companion standing between you instead — that is what they are for
        const pet = pets.nearest(e.x, e.z, (e.reach || 2.4) + 0.6);
        const victim = pet && field.rng() < 0.55 ? pet : player;
        const result = rpg.strike(e, victim, field.rng, { multiplier: incomingFrom(victim) * outgoingFrom(e) });
        if (e.lifeSteal) e.hp = Math.min(e.maxHp, e.hp + Math.round(result.amount * e.lifeSteal));
        if (e.onHit?.length) field.statusOnHit(e, victim, skillData.statuses);
        if (victim !== player) {
          if (result.dead) { pets.fall(victim); hud.log(`${victim.name} goes down.`, 'bad'); }
          return;
        }
        if (result.dodged) { hud.log(`You dodge ${e.name}.`); return; }
        hud.log(`${e.name} hits you for ${result.amount}${result.absorbed ? ` (${result.absorbed} on the barrier)` : ''}.`, 'bad');
        hud.hit(new THREE.Vector3(control.x, control.y + 1.9, control.z), result.amount, 'taken', camera);
        if (result.saved) hud.log('Something would not let you die.', 'level');
        if (result.reflected) hud.log(`Thorns bite back for ${result.reflected}.`, 'good');
        if (result.defenderPost?.guard) applyStatus(player, 'guard', skillData.statuses.guard, 1);
        if (result.dead && player.hp <= 0) respawn(e);
      },
      // archers and casters: a real bolt, drawn with the same spell effects the player uses
      onEnemyShoot: e => {
        const spec = e.ranged || { range: 24, element: 'physical' };
        const pet = pets.nearest(control.x, control.z, 4);
        const aimAt = pet && field.rng() < 0.4 ? pet : control;
        const from = new THREE.Vector3(e.x, e.y + 1.1 + (e.hover || 0), e.z);
        const to = new THREE.Vector3(aimAt.x, (aimAt.y ?? control.y) + 1, aimAt.z);
        const flight = Math.max(110, from.distanceTo(to) / 40 * 1000);
        spellfx.projectile({ from, to, element: spec.element, ms: flight })
          .then(() => {
            spellfx.impact({ at: to, element: spec.element });
            // it lands where it was aimed: if you moved, it misses
            const missed = Math.hypot(aimAt.x - to.x, aimAt.z - to.z) > 2.6;
            if (missed) return;
            const victim = aimAt === control ? player : aimAt;
            const result = rpg.strike(e, victim, field.rng, { multiplier: incomingFrom(victim) * outgoingFrom(e), element: spec.element });
            if (e.onHit?.length) field.statusOnHit(e, victim, skillData.statuses);
            if (victim === player) {
              hud.log(`${e.name} hits you for ${result.amount}.`, 'bad');
              hud.hit(new THREE.Vector3(control.x, control.y + 1.9, control.z), result.amount, 'taken', camera);
              if (player.hp <= 0) respawn(e);
            } else if (result.dead) { pets.fall(victim); hud.log(`${victim.name} goes down.`, 'bad'); }
          })
          .catch(() => { /* the scene went away mid-flight */ });
      },
    });

    // companions, treasure, and everything the round-4 systems need every frame
    pets.update(dt, control, player, {
      onPetHit: (p, target, result) => { if (result.crit) hud.log(`${p.name} lands a critical.`, 'good'); },
      onFallen: p => { hud.log(`${p.name} will come back.`, ''); },
      // …and say so when it does. `reviveSeconds` was dead data, so "will come back" was a lie.
      onReturned: p => { hud.log(`${p.name} is back.`, 'good'); },
    });
    if (!dungeon) {
      chests.update(control.x, control.z);
      gates.update(control.x, control.z);
      sites.update(control.x, control.z);
      sites.relax(control.x, control.z);
      encounters.update(dt, control, player);
      for (const site of sites.due(control.x, control.z)) {
        // a castle is not "a camp": sites.js gives each place its own blurb and its own type name
        hud.log(site.kind === 'lair'
          ? `Something lives at ${site.name}.`
          : (site.blurb || `${site.spec?.name || 'A camp'} at ${site.name}.`), 'bad');
        populateSite(site);
      }
    }
    for (const haul of chests.collect(control.x, control.z, dt)) {
      takeHaul({ items: haul.items || [], gold: haul.gold || 0, mats: haul.mats || {} });
      sound.loot({ rarity: 'rare' });
      rewards({
        title: haul.title || 'A haul', subtitle: haul.subtitle || '',
        gold: haul.gold || 0, items: (haul.items || []).map(rewardItem), button: 'Take it',
      });
    }
    // The effect registry's own clock: how long you have been fighting, hit streaks, cheat-death.
    //
    // …and then REBUILD THE SHEET when one of those timers changes what it is worth. This was the
    // missing half of "the move speed on hit proc doesn't seem to work in game": the timer ticked
    // and the registry knew about the buff, but `derived.moveSpeed` is only computed in
    // `rpg.refresh`, so nothing the buff added ever reached the legs. `rt.dirty` is set only when a
    // bucketed timer actually moves, so this is a handful of refreshes a fight, not sixty a second.
    const rt = rpg.fx.update(player, dt, { fighting: field.engaged });
    if (rt.dirty) rpg.refresh(player);
    const wasFighting = fighting;
    fighting = field.engaged;
    if (fighting && !wasFighting) {
      const start = rpg.fx.combatStart({ self: player });
      if (start.strip) {
        const big = field.enemies.find(e => e.dying == null && e.rank !== 'normal');
        if (big?.modifiers?.length) { big.modifiers.pop(); hud.log(`${big.name} loses one of its tricks.`, 'good'); }
      }
    }
    fx.update(dt);
    spellfx.update(dt);
    skills.update(dt);
    // whatever is burning or blessing the player keeps working while they run
    const selfTick = tickStatuses(player, dt, { resist: rpg.fx.product(player, 'statusIn') });
    if (selfTick > 0 && player.hp <= 0) respawn(null);
    hud.skills(skills.state());

    // a cast barrier runs down in real time, not on the one-second regen tick
    if (player.castBarrierFor > 0) {
      player.castBarrierFor -= dt;
      if (player.castBarrierFor <= 0) { player.castBarrierFor = 0; player.barrier = 0; }
    }
    sinceRegen += dt;
    if (sinceRegen > 1) {
      sinceRegen = 0;
      /**
       * YOU MEND WHEN NOTHING IS HITTING YOU.
       *
       * `hpRegen` is zero without gear that grants it, so a character who came out of a fight at 30
       * of 94 stayed there until they levelled — and there is no potion in the starting kit. Out of a
       * fight you get back 1.5% of your health a second, which is about a minute from nearly dead to
       * full: long enough that running away has a cost, short enough that it is not a walk home.
       */
      const mending = fighting ? 0 : player.maxHp * (balance.player?.outOfCombatRegen ?? 0.015);
      player.hp = Math.min(player.maxHp, player.hp + (player.derived.hpRegen || 0) + mending);
      player.mp = Math.min(player.maxMp, player.mp + (player.derived.mpRegen || 0) + (fighting ? 0 : player.maxMp * 0.02));
      // barrier refills out of a fight, and faster with `barrierRegen`
      /**
       * A barrier a SKILL put up is not the gear's barrier.
       *
       * This wiped `player.barrier` to zero every second for anyone whose gear grants none — which
       * is most characters — so the `bulwark` talent granted a shield that was gone before the
       * player could be hit by anything. A cast barrier is tracked separately and ticks down on its
       * own clock; the gear's pool refills underneath it as it always did.
       */
      const maxBarrier = player.derived.barrier || 0;
      if (maxBarrier > 0) {
        const rate = (player.derived.barrierRegen || 0) + (fighting ? 0 : maxBarrier * 0.08);
        player.barrier = Math.min(maxBarrier, Math.max(player.barrier || 0, 0) + rate);
      } else if ((player.castBarrierFor || 0) <= 0) {
        player.barrier = 0;
      }
    }

    rebuildWorldAround(false);
    // The watch: the spawner keeps out of these circles, and the guards inside them fight.
    field.safeZones = dungeon ? [] : folk.safeZones();
    folk.update(dt, control, { field, level: player.level, onLog: (t, c) => hud.log(t, c) });
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

    // --- light. The torch fades out in daylight and comes fully up at night; braziers, sconces,
    // warded chests and dungeon mouths hand their positions over and the nearest handful get lit.
    // …and anything the player has built that burns. A lamp post you put up has to light the street
    // it stands on, or there is no reason to put one up.
    light.setSources(dungeon
      ? dungeon.lights()
      : [...chests.lights(), ...gates.lights(), ...sites.lights(), ...(build.lights?.() || [])]);
    light.setRange(player.equipment.light?.range || null);
    light.update(dt, control, {
      day: Math.max(0, Math.min(1, sky.sunDirection.y * 1.6)),
      inside: !!dungeon,
      ambient: sky.ambient,
    });

    // --- the "press E to…" line, and the boss bar
    // …and not while a panel has the screen: the world prompt used to read "E speak to Rosie
    // Nine-Pies" at the bottom of the screen while her own shop said "E or Esc to step away"
    const near = talk.isOpen || rewardsOpen() || map.isOpen ? null : interactTarget();
    hud.prompt(near
      ? near.kind === 'portal' ? `<b>E</b> step through the portal`
      : near.kind === 'board' ? `<b>E</b> read the notice board`
      : near.kind === 'chest' ? `<b>E</b> open the ${near.chest.name.toLowerCase()}`
        : near.kind === 'dungeon' ? `<b>E</b> go down into ${near.gate.name}${near.gate.zone ? ` · level ${near.gate.zone.minLevel}–${near.gate.zone.maxLevel}` : ''}`
        : near.kind === 'leave' ? '<b>E</b> climb back out'
        : near.kind === 'wanderer' ? `<b>E</b> speak to ${near.met.name}, ${near.met.kindName.toLowerCase()}`
        : near.kind === 'landmark' ? `<b>E</b> ${near.mark.steps ? 'work on' : 'look at'} ${near.mark.name}`
          + (near.mark.steps ? ` · ${near.mark.done}/${near.mark.steps}` : '')
        /**
         * A seam says what is in it AND how good it is, because that is the decision.
         *
         * "a location where resources are dense but far away, and another where resources are not
         * as dense but closer" — the band is the density half of that, and you should be able to
         * read it off the ground without opening anything.
         */
        : near.kind === 'bell' ? (() => {
          const st = defence.standing();
          return st.state === 'offered' ? '<b>E</b> take the fight on'
            : st.state === 'accepted' ? '<b>E</b> ring the bell — they come when you say'
            : st.state === 'running' ? 'They are already at the wall'
            : `<b>E</b> listen at the bell${st.why ? ` · ${st.why}` : ''}`;
        })()
        : near.kind === 'seam' ? `<b>E</b> work the ${(resourceData?.materials?.[near.seam.resource]?.name || near.seam.resource).toLowerCase()}`
          + ` · ${(resourceData?.richnessBands?.find(b => b.key === near.seam.band)?.name || near.seam.band || '').toLowerCase()}`
        /**
         * …and anything this list has not heard of is NOT a person.
         *
         * The fallback used to be `near.who.name`, which is right for every branch above it and
         * wrong the moment a new kind of thing is added — it threw sixty times a second the first
         * time the player stood on an ore seam, because a seam has no `who`.
         */
        : near.who ? `<b>E</b> speak to ${near.who.name}`
        : null
      : null);
    /**
     * THE QUEST HELPER — §4.4.
     *
     * "quest markers lead nowhere. There should be a quest helper that activates when you get near
     * and says what to do." The markers were never wrong; arriving simply told you nothing, so a
     * marker with nothing under it and a marker you had not understood looked identical.
     *
     * ONE line, nearest job first, and only when the sentence itself changes — a helper that
     * repeats every frame is noise and one that never repeats is missed. `helperKey` is exactly
     * "this quest, saying this", so it speaks again when something has actually happened.
     */
    if (state.frames % 30 === 0 && !dungeon) {
      const [best] = helpersNear(questLog.active || [], { x: control.x, z: control.z });
      const key = best ? helperKey(best.quest, best.help) : null;
      if (key && key !== lastHelper) {
        lastHelper = key;
        hud.log(best.help.text, 'level');
      } else if (!key) {
        lastHelper = null;
      }
    }

    if (bossUnit && bossUnit.dying == null) hud.boss(bossUnit);
    else if (bossUnit) { bossUnit = null; hud.boss(null); }

    // --- weather
    const cell = terrain.cellAt(control.x, control.z);
    if (cell.x !== weatherCell[0] || cell.y !== weatherCell[1]) {
      weatherCell = [cell.x, cell.y];
      weather.setWeights(weatherWeights(terrain.climateAt(control.x, control.z)));
    }
    weather.update(dt);
    blended = weather.blend(blended);
    if (dungeon) { blended = { ...blended, cloud: 0, rain: 0, snow: 0, dust: 0, gloom: 1, lightning: 0 }; }

    const daylight = Math.max(0, Math.min(1, sky.sunDirection.y * 1.4));
    sky.update(state.elapsed, { gloom: blended.gloom, flash: weatherView.state.flash, cloud: blended.cloud, longitude: control.x / terrain.widthM });
    // the sky writes the ambient colour every frame, so underground has to have the last word
    if (dungeon) light.update(0, control, { day: 0, inside: true, ambient: sky.ambient });
    weatherView.update(dt, blended, { camera, daylight, sunDir: sky.sunDirection, baseFogColor: sky.fog.color });
    sunfx.update({
      camera, sunDirection: sky.sunDirection, dt,
      cloud: blended.cloud, eclipse: sky.eclipse.solar, day: daylight,
    });
    if (dungeon) {
      // Underground the weather does not get a say. Setting this once in enterDungeon was not
      // enough: the weather view writes the fog every frame, so it put the horizon back.
      scene.fog.color.set(dungeon.look.fog);
      scene.fog.near = 2;
      scene.fog.far = 70;
    } else {
      scene.fog.color.copy(weatherView.fogColor);
      scene.fog.far = weatherView.fogFar;
      scene.fog.near = weatherView.fogNear;
    }

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

    /**
     * What the target bar is looking at, and how far off it is — the bar used to sit at full health
     * on something thirty metres away with nothing to say it was out of reach.
     */
    const targetUnit = field.target(control);
    const target = targetUnit ? {
      ...targetUnit,
      distance: Math.hypot(targetUnit.x - control.x, targetUnit.z - control.z),
      reach: (player.derived?.reach ?? 0) || (control.reach ?? 3),
    } : null;
    const town = features.settlementAt(control.x, control.z);
    if (town && campaign.onEnterSettlement(town.id)) hud.log(`${town.name} charted.`, 'level');
    /**
     * F15: crossing the boundary lights the pad. Diablo 2's rule, and the user's:
     * "No need to get physically close to them though, entering the city boundaries is enough."
     * `settlementAt` is already that test — the same one the HUD uses to say where you are.
     */
    if (town) {
      const lit = waypoints.visit(town);
      if (lit) {
        hud.log(`The sigils at ${town.name} light as you cross the boundary. You can travel here from any other waypoint.`, 'level');
        sound.questDone();
        features.update(control.x, control.z, true);   // so the ring lights now, not on the next visit
      }
    }
    if (!campaignDone && campaign.complete) {
      campaignDone = true;
      hud.log(`${campaignData.title} complete. The ledger is closed.`, 'level');
      sound.questDone();
      autoSave();
    }
    if (state.frames % 45 === 0) {
      sound.place(terrain.biomeAt(control.x, control.z).key, { inTown: !!town, storm: blended.wind });
    }
    const here = dungeon ? null : zones.at(control.x, control.z);
    hud.here = here;
    // crossing a border announces the new region on screen, with its band
    if (here) hud.announceZone(here, player.level);
    if (here && here.id !== boardZone) enterTerritory(here);
    if (state.frames % 30 === 0) tickTerritory(0.5);

    /**
     * The base runs whether you are watching it or not.
     *
     * The grid and the works tick every frame because a duty cycle and a smelter both care about
     * fractions of a second; the colony and the farm are given the clock instead, because a citizen's
     * day is measured in hours and a crop's life in days.
     */
    // a solar array wants the sun's HEIGHT, not the hour: noon is 1, midnight 0, dusk in between
    grid.tick(dt, {
      daylight: Math.max(0, Math.sin(sky.dayFraction * Math.PI * 2 - Math.PI / 2)),
      wind: blended.wind ?? 0.5,
    });
    works.tick(dt);
    // the grid's answer reaches the pad, the turret and the smelter — see syncPower
    if (state.frames % 20 === 0) syncPower();
    if (state.frames % 15 === 0) {
      /**
       * THE COLONY HAS TO BE TOLD WHAT YOU BUILT.
       *
       * `colony.setBase` is the one input the whole module has — beds decide how many people can
       * live here, defences decide whether anybody feels safe enough to come, structures decide how
       * prosperous the place is and therefore what a tax is worth. Nothing was calling it, so every
       * one of those was zero for ever: appeal 0, migration never, prosperity 1.00, tax nothing.
       */
      colony.setBase?.({
        structures: build.entries?.length || 0,
        defences: (build.entries || []).filter(e => build.defOf?.(e.key)?.cat === 'defence' && e.powered !== false).length,
        beds: (build.entries || []).filter(e => e.key === 'bed').length,
        waypoint: (build.entries || []).some(e => e.waypoint),
        wealth: player.gold || 0,
      });
      colony.setClock?.(sky.dayFraction * 24, Math.floor(state.elapsed / (balance.sky?.dayLengthSeconds ?? 900)) + 1);
      colony.tick?.(dt * 15);
      farm.tick?.(dt * 15);
      board.runMachines?.(works.machines?.() || [], (dt * 15) / 3600);
    }
    tickPools(dt);
    // the seams' respawn clocks, and the drills and routes that work them
    if (state.frames % 900 === 0) ore.tick(15);
    mining.tick(dt);
    /**
     * THE TURRETS SHOOT BACK.
     *
     * Every powered defensive structure with a `defence` block in the catalogue picks the nearest
     * thing in range and hits it. A wall, a gate or a trap has no block and never fires — gating on
     * the category alone would have a palisade sniping across the valley.
     */
    defence.tick(dt, {
      enemies: field.enemies,
      onHit: (unit, gun, turret) => {
        field.strikeArea(unit.x, unit.z, Math.max(0.8, gun.splash), player, {
          element: gun.element, power: gun.damage / Math.max(1, player.derived?.damage || 10),
        });
        // the shot has to be VISIBLE or a turret reads as broken: the enemy loses health across
        // the clearing and nothing says why
        spellfx?.projectile?.({
          from: new THREE.Vector3(turret.x, (turret.y || 0) + 2.2, turret.z),
          to: new THREE.Vector3(unit.x, (unit.y || 0) + 0.9, unit.z),
          element: gun.element || 'physical',
          shape: gun.element ? null : 'arrow',
          ms: 160,
        });
      },
    });

    // …and the rocks on the ground. It does its own "has anything changed" check.
    if (state.frames % 10 === 0) {
      oreView.update(ore.around(control.x, control.z), control.x, control.z, {
        heightAt: (x, z) => terrain.heightAt(x, z),
        // seams are sparse — about fourteen to a 512 m tile — so a short draw radius means walking
        // through a field of ore and seeing none of it. This is cheap: one InstancedMesh per kind.
        radius: lowQuality ? 260 : 360,
      });
    }

    /**
     * BUILD MODE FOLLOWS WHERE YOU ARE LOOKING, NOT WHERE YOU ARE STANDING.
     *
     * This was `build.aim(control.x, control.z)` — the player's own feet — so the ghost sat inside
     * the character, the brush levelled the ground you were standing on, and placing anything meant
     * walking onto the exact spot and then off it again. The cursor is a ray now: march out along
     * the camera's heading in one-metre steps until it goes under the ground, which is a hit test
     * that costs a handful of height lookups and needs no physics.
     */
    if (build.mode) {
      const spot = aimSpot();
      build.aim(spot.x, spot.z);
      buildUI.tick();
    }
    hud.tick(player, {
      place: dungeon ? dungeon.name : town ? `${town.name} (${town.kind || 'settlement'})` : (terrain.regionAt(control.x, control.z) || terrain.biomeAt(control.x, control.z).name),
      zone: dungeon ? { minLevel: dungeon.level, maxLevel: dungeon.level + 2, midLevel: dungeon.level + 1, danger: 'Underground' } : here,
      clock: clockText(sky.dayFraction, control),
      target,
      // underground it still reported the weather, the daylight and the surface gravity
      sky: dungeon ? '' : skyText(sky),
      weather: dungeon
        ? `${dungeon.plan.rooms.length} rooms · level ${dungeon.level}`
        : blended.name + (weather.locked ? ' · held' : '') + (control.swimming ? ' · swimming' : '') + (control.mounted ? ' · riding' : ''),
      where: hud.locationText(control, dungeon),
    });
    if (state.frames % 6 === 0) {
      hud.daylight = Math.max(0.28, Math.min(1, sky.sunDirection.y * 1.7 + 0.3));
      /**
       * `revealRange` WIDENS THE MINIMAP, WHICH IS THE ONLY THING IT COULD MEAN.
       *
       * Derived off the affixes ("you see further on the map") and read by nothing. The span is in
       * CELLS, and `+`/`-` still set the base — this multiplies whatever the player chose, so the
       * affix makes their own setting better rather than overriding it.
       */
      hud.revealMul = 1 + (player.derived.revealRange || 0);
      if (dungeon) hud.drawDungeonMap(control, dungeon.plan, field.enemies, chests.chests);
      else hud.drawMinimap(control, field.enemies, [
        ...chests.chests.filter(c => !c.opened).map(c => ({ x: c.x, z: c.z, color: '#ffd24a', r: 3 })),
        // something still in the air, with how long you have to get there
        ...meteors.marks().map(m => ({ x: m.x, z: m.z, icon: '☄', color: '#ff8a40' })),
        ...gates.visible.map(g => ({ x: g.x, z: g.z, color: '#b090ff', r: 4 })),
        // each stronghold type draws itself: sites.js carries a colour, a radius and a glyph per
        // kind, so a castle and a bandit camp are not the same orange dot
        ...sites.visible.map(v => ({
          x: v.x, z: v.z,
          color: v.pin?.color || (v.kind === 'lair' ? '#ff6a3a' : '#ffa860'),
          r: v.pin?.r ?? 3.4,
          glyph: v.pin?.glyph || null,
          // a world boss carries its own character; without this it is just a big red pip
          icon: v.pin?.icon || undefined,
        })),
        ...pets.pets.filter(p => p.dying == null).map(p => ({ x: p.x, z: p.z, color: '#7ae06a', r: 2.6 })),
        ...folk.marks(),
        /**
         * The Territory, on the minimap.
         *
         * Without this the whole layer is invisible: a wanderer is one body in forty square
         * kilometres and you would have to walk into them, and a camp you are meant to clear looks
         * like ordinary ground. Each mark is drawn in the colour of whoever it belongs to, which is
         * also how you tell the people pushing into a zone from the people who hold it.
         */
        ...(hud.here ? holdings.sitesIn(hud.here.id).map(si => ({
          x: si.x, z: si.z, r: 3.6,
          color: si.hostile ? (factionColour(si.faction) || '#ff6a3a') : '#6f8aa8',
        })) : []),
        ...(hud.here ? patrols.inZone(hud.here.id).map(p => ({
          x: p.x, z: p.z, r: 2.8, color: factionColour(p.faction) || '#9fb0c8',
        })) : []),
        ...(hud.here ? trade.inZone(hud.here.id).map(c => ({
          x: c.x, z: c.z, icon: '▣', color: c.state === 'wrecked' ? '#8a6a5a' : factionColour(c.faction) || '#c8b48a',
        })) : []),
        ...(hud.here ? roadFolk.inZone(hud.here.id).map(w => ({
          x: w.x, z: w.z, icon: '•', color: '#eaf6ff',
        })) : []),
        ...(hud.here ? holdings.landmarksIn(hud.here.id).map(l => ({
          x: l.x, z: l.z, icon: l.state === 'done' ? '◈' : '◇', color: '#a8c8e8',
        })) : []),
      ], markers.tracked().map(m => {
        const b = markers.bearing(m, control, terrain);
        return { ...m, x: b.x, z: b.z, distance: b.distance };
      }));
    }
    // the sky's own events: a meteor every few minutes, and shooting stars in between
    if (!dungeon) meteors.update(dt, control);
    if (state.frames % 12 === 0) map.tick();

    renderFrame();
  }

  function respawn(killer = null) {
    /**
     * THE STONE THAT SAID YOU WOULD GET UP ONCE.
     *
     * `gives.reviveDaily` on a landmark. Without this it would be one more flag written and never
     * read, which is the exact mistake this whole round was about: you get up where you fell, you
     * keep your gold, and it costs the charge.
     */
    const today = Math.floor(state.elapsed / (balance.sky?.dayLengthSeconds ?? 900));
    if (player.reviveDay != null && player.reviveDay !== today) player.reviveCharge = 0;
    if ((player.reviveCharge || 0) > 0) {
      player.reviveCharge--;
      player.hp = Math.round(player.maxHp * 0.4);
      player.mp = Math.round(player.maxMp * 0.25);
      hud.log('The water holds. You get up where you fell.', 'level');
      sound.questDone();
      hud.setPlayer(player);
      return;
    }
    if (dungeon) { hud.log('You wake outside, with no memory of the climb.', 'bad'); leaveDungeon(); }
    else hud.log('You black out, and wake where you landed.', 'bad');
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

  /**
   * WHO TOLD YOU.
   *
   * E15: every rumour was signed "somebody in The Bleak Moor", which is exactly the flavour a rumour
   * system exists to avoid — a rumour is a person saying a thing, and an anonymous one is just a
   * notification. The zone already has people in it, so one of them gets the credit: their name,
   * what they do, and where they are. Their trade matters more than their name here ("the smith in
   * Pebelkeep" is a better source than a name you have never heard), so both go in.
   *
   * Nobody about — an empty stretch of road, a zone whose settlements are out of range — falls back
   * to the old wording, because "somebody on the road" is honest when there is genuinely nobody.
   */
  function rumourSource(zone) {
    const people = folk?.roster?.() || [];
    if (!people.length) return 'somebody on the road';
    const who = people[Math.floor(Math.random() * people.length)];
    const trade = who.roleName ? who.roleName.toLowerCase() : null;
    const place = who.node?.name || zone?.name;
    if (who.name && trade && place) return `${who.name}, the ${trade} in ${place}`;
    if (who.name && place) return `${who.name}, in ${place}`;
    return who.name || 'somebody on the road';
  }

  function clockText(fraction, c) {
    const hours = Math.floor(fraction * 24), minutes = Math.floor((fraction * 24 % 1) * 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} · ${Math.round(c.y)} m`;
  }
  function skyText(s) {
    const up = s.visible().slice(0, 2);
    if (!up.length) return '';
    /**
     * C10: this rendered "Shaukraen Anchor III, Shaukraen Anchor IV a in the daylight" — no verb, a
     * comma where an "and" belongs, and a moon's raw catalogue designation. The chart and the space
     * screen both already say "Moon of X"; this now agrees with them.
     */
    const names = up.map(b => b.moon ? `${b.parentName || 'its parent'}'s moon` : b.name);
    const list = names.length > 1
      ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
      : names[0];
    const verb = names.length > 1 ? 'are' : 'is';
    return `${list} ${verb} up${s.isNight ? '' : ', in the daylight'}`;
  }

  $('boot').classList.add('hidden');
  state.running = true;
  autoSave();
  tick();

  // ---------------------------------------------------------------- test handle
  window.farhold = {
    THREE, renderer, scene, camera, weatherView, weather, debug, fx,
    star, system, saves, horse, boat,
    rpg, player, hud, actor, balance, state,
    // `control`, `field`, `props`, `features`, `view`, `sky` and the rest are REBUILT when you land
    // on another world, so the handle has to read them through a getter. Captured by value they go
    // stale the moment you fly anywhere, and a test then compares an old position against a new
    // planet's ground — which is exactly what "you landed in the sea at 55 m" turned out to be.
    // `folk` is rebuilt with the world, like `control` below, so it has to be a getter too
    get folk() { return folk; },
    // the waypoint network, and the same travel action the map's click uses
    get waypoints() { return waypoints; },
    // the building expansion, for the tests and the debug menu
    get build() { return build; },
    get stores() { return stores; },
    /** The materials bag itself. `materials` below is already taken by its JSON readout. */
    get bag() { return materials; },
    get grid() { return grid; },
    /** The build catalogue, so a test or the debug menu can read a cost without a second fetch. */
    get structures() { return structureData || { structures: [] }; },
    get works() { return works; },
    get colony() { return colony; },
    get farm() { return farm; },
    get board() { return board; },
    get portals() { return portals; },
    get terraform() { return terraform; },
    get ore() { return ore; },
    get oreView() { return oreView; },
    get mining() { return mining; },
    get defence() { return defence; },
    /** Every enemy id, so a test can spawn one without reading the data file. */
    get bestiaryIds() { return (bestiary.enemies || []).map(e => e.id); },
    shipGate: () => canLaunchShip(player),
    /** The shipyard's own actions, for the tests and the debug menu — the same ones the panel calls. */
    /** The shipyard's own actions — the same object the panel's buttons call. */
    shipyardApi: shipyardActions,
    get shipFuel() { return shipYard(player).fuel; },
    travelTo: id => map.travelTo(id),
    /** Open the shop panel on somebody, for the specs — the same call the E key makes. */
    openTalk: who => talk.show(who, talkContext(who)),
    get control() { return control; },
    get field() { return field; },
    get props() { return props; },
    get features() { return features; },
    get view() { return view; },
    get sky() { return sky; },
    get world() { return world; },
    get map() { return map; },
    /** Is the world under your feet a settled, multi-biome one? (round 10, for the specs) */
    liveableHere: () => isHabitableStart(planet),
    /** Does the system you are in hold one at all? */
    liveableInSystem: () => landableBodies(system).some(isHabitableStart),
    zones, chests, gates, sites, pets, craft, light, encounters, skillData, classData, encounterData,
    // The Territory expansion, for the specs and the debug menu
    standings, holdings, trouble, patrols, trade, roadFolk, rumours, jobs, factionData,
    creditKill, meetOnTheRoad,
    get sites() { return sites; },
    get folk() { return folk; },
    get board() { return localBoard; },
    enterTerritory, tickTerritory,
    pauseMenu,
    get dungeon() { return dungeon; },
    get bossUnit() { return bossUnit; },
    enterDungeon: (node = null) => {
      // A world with no `dungeon` nodes on it still needs to be testable, so fall back to a mouth
      // at the player's feet. The game itself only ever enters through a gate that is really there.
      const g = node || gates.visible[0] || gates.nodes[0]
        || { id: 0, name: 'Test Hollow', x: control.x, z: control.z, zone: zones.at(control.x, control.z) };
      return enterDungeon(g);
    },
    leaveDungeon,
    openChest: () => { const c = chests.nearest(control.x, control.z, 999); return c ? openChest(c) : null; },
    placeChest: (kind = 'gilded') => chests.place(kind, control.x + 2, control.z + 2, { level: player.level }),
    materials: () => craft.materials.toJSON(),
    recycle: item => craft.recycle(item),
    torch: on => light.setTorch(on),
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
    // through `clampToWorld` first: a coordinate off the map used to reach `colorAt` with a biome id
    // that has no colour, which threw inside the ring rebuild and killed the frame loop
    teleport: (x, z) => {
      const [cx, cz] = terrain.clampToWorld(Number(x) || 0, Number(z) || 0);
      control.teleport(cx, cz);
      rebuildWorldAround(true);
    },
    get mode() { return mode; },
    get space() { return space; },
    get air() { return air; },
    get planet() { return planet; },
    get palette() { return palette; },
    get terrain() { return terrain; },
    launch, land,
    get folk() { return folk; },
    questLog, markers, talk, talkContext, sound, speech, campaign, settings, meteors,
    get band() { return band; },
    chart, galaxy, warp, beginJump,
    get starId() { return starId; },
    /** Every base you ever raised, and the trip home — see js/homes.js. */
    homes,
    returnToBase,
    get starNow() { return starNow(); },
    get systemSeed() { return systemSeed; },
    skills, spellfx, sunfx,
    /** First person on or off, for a test or the debug menu. */
    firstPerson: on => setFirstPerson(on),
    /** Fire a skill slot from a test or the debug menu. */
    cast: i => castSkill(i),
    get statuses() { return { player: player.statuses || {}, enemies: field.enemies.map(e => ({ name: e.name, statuses: e.statuses || {} })) }; },
    /** Skip the cinematics — go straight to space, or straight down onto a world. */
    toSpace: () => { ensureSpace().enter({ fromPlanet: planet, elapsed: state.elapsed }); camera.far = 600000; camera.updateProjectionMatrix(); mode = 'space'; },
    landOn: (planetId, spot = null) => {
      // moons are landable too, and they are not in `system.planets` — they hang off their parent
      const all = [...system.planets, ...system.planets.flatMap(x => x.moons || [])];
      const p = all.find(x => x.id === planetId) || planet;
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
    /** How many perk points are unspent — the level-up currency, since round 7. */
    perkPoints: () => perkPointsLeft(player),
    give: (baseKey, rarity = 'rare', opts = {}) => {
      const level = opts.level ?? player.level;
      const item = attuneWeapon(rpg.loot.generate(baseKey, rarity, 'high', { rng: rpg.rng, level, ...opts }));
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
