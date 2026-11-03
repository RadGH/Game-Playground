// Oddhaven: the page. Loads the world and the baked cars, starts the sim in its Worker, then runs one frame loop:
// rules (mirror of the sim, Rapier) -> picture (who is drawn where) -> draw.
import { installAudioWake } from './audio-wake.js';     // first: it has to see every sound context the page makes
import * as THREE from 'three';
import RAPIER from '../../../../vendor/rapier/rapier.mjs';
import { FIRST_MAP } from '../world/first-map.js';
import { buildWorld } from '../world/build-world.js';
import { buildNetwork } from '../world/routes.js';
import { createRails } from '../world/rails.js';
import { createPaths } from '../world/pavement.js';
import { createAutopilot } from '../world/autopilot.js';
import { townFromWorld } from '../sim/world-town.js';
import { createInput } from '../../../roverlands/js/game/input.js';
import { svgPortrait } from '../../../thousandvale/js/client/ui/svg-portrait.js';
import { TIERS, chooseTier, deviceFacts } from './gfx-tier.js';
import { createWorldView } from './world-view.js';
import { bakeVehicle } from './vehicle-bake.js';
import { createTrafficView } from './traffic-view.js';
import { createRailCars } from './rail-cars.js';
import { createPeopleView } from './people-view.js';
import { createDrive, spawnSpot } from './drive.js';
import { createGod } from './god.js';
import { pick } from './picking.js';
import { ordersFor, placeName, stirRows } from './orders.js';
import { createGodHud } from './god-hud.js';
import { createGallery } from './gallery.js';
import { createLooks, randomDesign } from './looks.js';
import { createCreator } from './creator.js';
import { designAvatar, fitRace, makerOf } from './design.js';
import { createPortraits, faceKey } from './portraits.js';
import { WEAR_KINDS, WEAR_NAMES } from './outfits.js';
import { RACE_NAMES as RACE_WORDS } from './mood.js';
import { createTown } from './town-link.js';
import { createCoop } from './coop.js';
import { createTalk } from './talk.js';
import { createBubbles } from './bubbles.js';
import { createChatter } from './chatter.js';
import { createStage } from './stage.js';
import { createVoice, profileFor, delivery } from './voice-api.js';
import { createSaves } from './saves.js';
import { gunzipText } from '../sim/save.js';
import { createTouch } from './touch.js';
import { createPerf } from './perf.js';
import { createShell, loadSettings, saveSettings, SOAK_URL, BUILD, el } from './shell.js';
import { createSoak, soakAsked, sendLeftover } from './soak.js';
import { createHands } from './hands.js';
import { createHandsHud } from './hands-hud.js';
import { createKeyNav } from './keynav.js';
import { recapCard, diaryLines } from './recap.js';
import { createFeet } from '../world/walker.js';
import { createRoads } from '../sim/roads.js';
import { buildingPlan } from '../sim/places.js';
import { toWorld, FLOOR_H } from '../sim/interior.js';
import { createInteriorView, floorY } from './interior-view.js';
import { createIndoors } from './indoors.js';
import { createTimberView } from './timber-view.js';
import { createJobHands } from './job-hands.js';
import { createPhone } from './phone.js';
import { happeningLine, callName } from './phone-text.js';
import { Sfx } from '../../../../sfx/js/sfx.js';
import { createFireView } from './fire-view.js';
import { createRiftView } from './rift-view.js';
import { createCreature } from '../../../../avatar-3d/js/creatures.js';
import { compactCreature } from '../../../../avatar-3d/js/mesh-merge.js';
import { createSiren } from './fire-sound.js';
import { createMomentCard } from './moment-card.js';
import { createNews } from './news-text.js';
import { occludeK } from '../world/sightline.js';
import { fitsGarage } from '../sim/parking.js';

const line = t => { const b = document.getElementById('boot-line'); if (b) b.textContent = t; };
const breathe = () => new Promise(r => setTimeout(r, 0));
const canvas = document.getElementById('view');
const params = new URLSearchParams(location.search);
const facts = deviceFacts();
const settings = loadSettings();
const forced = params.get('tier');
let tierName = forced === 'low' || forced === 'high' ? forced : chooseTier(settings.tier, facts);

function fail(e) { console.error(e); line('Sorry, the road is closed: ' + (e?.message || e)); }

async function boot() {
  line('Warming the engine');
  await RAPIER.init();
  line('Laying the roads');
  await breathe();
  const world = buildWorld(FIRST_MAP);
  const net = buildNetwork(world);
  const vdata = await (await fetch(new URL('../../../roverlands/data/vehicles.json', import.meta.url))).json();
  const extra = await (await fetch(new URL('../../data/vehicle-extra.json', import.meta.url))).json();
  const presets = await (await fetch(new URL('../../../../avatar-2d/data/presets.json', import.meta.url))).json();
  const dataFile = async f => (await fetch(new URL(`../../data/${f}.json`, import.meta.url))).json();
  const [buildingsData, peopleData, premades, wiring, newsTable, jobsData, monstersData] = await Promise.all([dataFile('buildings'), dataFile('people'), dataFile('premades'), dataFile('wiring'), dataFile('news'), dataFile('jobs'), dataFile('monsters')]);
  const baked = await fetch(new URL('../../data/portraits/index.json', import.meta.url)).then(r => (r.ok ? r.json() : {})).catch(() => ({}));     // the gallery's faces, drawn once
  // the town: every building's trade and its real plan. One plan per building, the same one the sim is holding
  const townData = townFromWorld(world, buildingsData);
  const planOf = new Map();
  for (const row of townData.buildings) { const plan = buildingPlan(row, buildingsData.kinds[row.kind], wiring); if (plan) planOf.set(row.id, plan); }
  const plans = id => planOf.get(id) ?? null, buildingById = new Map(world.buildings.map(b => [b.id, b]));
  /** What the wiring says right now. A closed shutter or garage door is a wall to anyone walking. */
  const mech = (id, target) => { const row = town.mirror.mech[id]; if (row && row[target] !== undefined) return row[target]; return planOf.get(id)?.defaults?.[target] ?? 0; };
  const jammed = (id, d) => town.mirror.fires?.some(F => F.b === id && F.jam.includes(d.id)) ?? false;
  const doorShut = (id, d) => jammed(id, d) || (d.closed || d.shutter ? !mech(id, `door:${d.id}`) : false);
  const defOf = id => vdata.vehicles.find(v => v.id === id);

  // ---- renderer, light, sky
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tierName === 'high', powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = TIERS[tierName].shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.4, TIERS[tierName].fogFar + 30);
  const skyCanvas = document.createElement('canvas'); skyCanvas.width = 4; skyCanvas.height = 128;
  { const x = skyCanvas.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#5f9ccf'); g.addColorStop(0.62, '#a8cfe6'); g.addColorStop(1, '#dbe9ee'); x.fillStyle = g; x.fillRect(0, 0, 4, 128); }
  const skyTex = new THREE.CanvasTexture(skyCanvas); skyTex.colorSpace = THREE.SRGBColorSpace; scene.background = skyTex;
  scene.fog = new THREE.Fog('#cfe2ea', TIERS[tierName].fogNear, TIERS[tierName].fogFar);
  scene.add(new THREE.HemisphereLight('#e6f1ff', '#6b6a50', 1.5));
  const sun = new THREE.DirectionalLight('#fff1da', 2.3), sunDir = new THREE.Vector3(0.5, 0.8, 0.32).normalize();
  sun.castShadow = TIERS[tierName].shadows; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 320 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  const enhance = m => { if (m.metalness > 0.2) { m.metalness *= 0.25; m.roughness = Math.min(1, m.roughness + 0.2); } return m; };

  // ---- what stands on the map
  line('Building two towns');
  await breathe();
  const worldView = createWorldView({ THREE, scene, world, tier: tierName });
  line('Washing the cars');
  await breathe();
  const types = new Map(), extras = new Map(extra.vehicles.map(v => [v.id, v]));
  const usedTypes = new Set([...peopleData.cars, peopleData.taxiModel, extra.player, 'fire_truck', 'ambulance', 'police_car']);
  for (const v of extra.vehicles) { if (!usedTypes.has(v.id)) continue; types.set(v.id, await bakeVehicle(THREE, defOf(v.id), v)); await breathe(); }
  const vdefs = new Map([...usedTypes].map(id => [id, defOf(id)]));
  const looks = createLooks({ presets, premades });
  const town = createTown({ onEvent: e => game.simEvent(e), onError: e => console.error('[oddhaven sim]', e), onRoom: m => coop.message(m) });
  const rails = createRails(net), paths = createPaths(world), feet = createFeet(world, net, { plans, shut: (box, d) => doorShut(box.b.id, d) }), roads = createRoads(townData);
  const cars = createRailCars({ rails, routes: id => town.mirror.routes.get(id), types, groundAt: (x, z) => feet.ground(x, z), serverNow: () => town.serverNow() });
  town.onSnap(snap => { cars.owner = town.owner; if (snap) cars.apply(snap); else cars.reset(); });
  town.onRel(g => cars.relayed(g));
  const traffic = cars;
  const trafficView = createTrafficView({ THREE, scene, traffic, types, extras });
  const interiors = createInteriorView({ THREE, scene, plans, mech, burnt: id => town.mirror.burnt?.[id] ?? null });
  const fireView = createFireView({ THREE, scene, world, town, plans, ground: (x, z) => feet.ground(x, z), tier: tierName });
  const riftView = createRiftView({ THREE, scene, town, ground: (x, z) => feet.ground(x, z), tier: tierName, kinds: monstersData.kinds, createCreature, compactCreature });
  town.handsPos = id => (hands.on && id === hands.me ? hands.you : null);
  const openLv = new Map();          // building id -> the floor showing, for whoever is open this frame
  const indoors = createIndoors({ town, buildings: buildingById, plans, shut: doorShut, isOpen: id => openLv.get(id) ?? null });
  const timber = createTimberView({ THREE, scene, world, town });
  const people = createPeopleView({ THREE, scene, world, town, looks, paths, cars, carTypes: types, vdefs, indoors, timber, floorOf: (x, z, lv) => feet.ground(x, z, lv), isOpenAt: (place, lv) => openLv.get(town.roster.places[place]?.building) === lv });
  line('Finding the keys');
  const playerDef = defOf(extra.player), restLift = types.get(extra.player).lift;
  const drive = await createDrive({ THREE, RAPIER, scene, camera, world, def: playerDef, net, enhance, restLift });
  drive.testCarOn(false);
  const projected = new THREE.Vector3();
  const project = (x, y, z, out = {}) => { projected.set(x, y, z).project(camera); if (projected.z > 1 || Math.abs(projected.x) > 1.2 || Math.abs(projected.y) > 1.2) return null; out.x = (projected.x + 1) / 2 * innerWidth; out.y = (1 - projected.y) / 2 * innerHeight; return out; };
  const bubbleLayer = document.createElement('div'); document.body.append(bubbleLayer);
  const bubbles = createBubbles({ parent: bubbleLayer, project });
  const voice = createVoice({ volume: settings.sound });
  let talk = null;
  const chatter = createChatter({ town, people, talk: () => talk, bubbles, voice, voiceOn: () => settings.voices !== 'off' && settings.sound > 0, profileFor, delivery, words: () => talkWords(), staged: id => !!stage?.stage.has(id), day: () => gameDay() });
  let viewFloor = 0;      // the floor the camera is looking at: a flat four storeys up is further from the ground, and the camera goes up with it
  const groundY = (x, z) => world.heightAt(x, z) + viewFloor * FLOOR_H;
  // Stir: a finger on one person, dragged onto another
  const STIR_REACH = 34;
  const personNear = (x, y, not = -1) => { let best = null, d = STIR_REACH; for (const q of people.drawn()) { if (q.id === not || q.hidden) continue; const s = project(q.x, q.y + 0.9, q.z); if (!s) continue; const e = Math.hypot(s.x - x, s.y - y); if (e < d) { d = e; best = q; } } return best; };
  let stirFrom = null;
  const god = createGod({ THREE, camera, canvas, groundY, onTap: (x, y) => game.tap(x, y), onGrab: {
    down(x, y) { if (document.querySelector('.modal') || god.dist > 70) return false; const q = personNear(x, y); if (!q) return false; stirFrom = { id: q.id, x, y, moved: 0 }; return true; },
    move(x, y) { if (!stirFrom) return; stirFrom.moved = Math.max(stirFrom.moved, Math.hypot(x - stirFrom.x, y - stirFrom.y)); if (stirFrom.moved > 14) hud.stirLine(stirFrom, { x, y }); },
    up(x, y, real) {
      const from = stirFrom; stirFrom = null; hud.stirLine(null); if (!from) return false;
      if (from.moved <= 14) return false;     // it was a tap
      if (!real) return true;
      const to = personNear(x, y, from.id);
      if (to) stirMenu(from.id, to.id);
      return true;
    },
  } });
  const SELECT_DIST = 24;
  const portraits = new Map(), faces = createPortraits({ THREE, renderer });
  const bakedFace = key => (baked[key] ? new URL(`../../data/portraits/${key}.webp`, import.meta.url).href : null);
  const premadeKey = look => { const m = /premade-(.+)-(\d+)$/.exec(look); return m ? `${m[1]}-${m[2]}` : null; };
  /** A face: the baked render for a premade, a kept render for someone you made or your own family, else the paper doll. Never waits. */
  const portraitOf = p => {
    const k = premadeKey(p.look), done = k && bakedFace(k); if (done) return done;
    const a = looks.avatarFor(p), real = faces.known(a); if (real) return real;
    let u = portraits.get(p.look); if (!u) portraits.set(p.look, u = svgPortrait(a));
    return u;
  };
  /** Someone worth a real face: rendered behind the game, then the faces on screen pick it up. */
  const wantFace = p => { const k = premadeKey(p.look); if (k && bakedFace(k)) return; const a = looks.avatarFor(p); if (faces.known(a)) return; faces.shot(a).then(() => { if (game.household?.members?.includes(p.id)) hud.family(game.household.members, town); if (game.selected === p.id) hud.person(-1), hud.person(p.id, town.roster.people[p.id], game.info, null, town); }).catch(e => console.warn('[oddhaven] face', e)); };
  const premadePortrait = (h, m) => { const k = `${h.id}:${m}`, b = bakedFace(`${h.id}-${m}`); if (b) return b; let u = portraits.get(k); if (!u) portraits.set(k, u = svgPortrait(looks.premadeAvatar(h, m))); return u; };
  const GOD_HEIGHT = 0.55, things = world.buildings.map(b => ({ ...b, h: b.h * GOD_HEIGHT }));
  const parks = world.blocks.filter(b => b.style === 'park');
  const saves = createSaves({ canRestore: () => game.screen === 'title' });

  // ---- input, sound, shell
  let sounds = null;
  const unlockSound = async () => {
    if (sounds || settings.sound === 0) return;
    try { const { createSounds } = await import('../../../roverlands/js/client/sounds.js'); sounds = await createSounds({ volume: settings.sound }); await sounds.unlock(); } catch (e) { console.warn('[oddhaven] sound', e); }
  };
  const touch = createTouch({ onView: () => game.toggleView(), onHorn: () => sounds?.play('horn'), onTap: (x, y) => game.handsTap(x, y), onSkill: () => jobs.skill(), onDodge: () => jobs.dodge() });
  document.body.append(touch.el);
  const input = createInput(canvas, { touch: () => touch.state(), settings: () => ({}) });
  input.wantLock = false;
  const perf = createPerf(renderer);
  const game = {
    settings, get tier() { return tierName; }, get view() { return drive.view; }, driving: false, screen: 'title', household: null, selected: -1, speed: 1, pending: null,
    modalChanged() {},
    /** A new life: pick a household, the town starts at 06:00 on day one. */
    async begin(h) {
      unlockSound();
      const seed = Number(params.get('seed')) || (Math.random() * 1e9) | 0, wanted = coop.wantedFromUrl, hosting = game.pendingHost;
      game.pendingHost = false;
      const first = wanted ? coop.urlFirst() : hosting ? coop.hostFirst({ seed }) : null, joined = first ? await startTown({ link: coop.linkFor(first) }) : false;
      if (!joined) { if (first) await soloInstead(); await startTown({ seed }); }
      enterGod(town.roster.households.find(x => x.premade === h.id) ?? town.roster.households[0]);
      game.saveNow();
      if (joined) coop.afterRoom();
      if (joined && hosting) coop.sheet();
    },
    /** A person from the creator, into a brand-new town: with a family from the gallery, or in a home of their own. */
    async beginMade(cmd, premade) {
      unlockSound();
      await startTown({ seed: Number(params.get('seed')) || (Math.random() * 1e9) | 0 });
      const h = premade ? town.roster.households.find(x => x.premade === premade) : null;
      madeNext = { go: true };
      town.cmd({ kind: 'addPerson', ...cmd, household: h ? h.id : null });
      coop.rememberMe({ ...cmd, household: null });
    },
    async resume() {
      unlockSound();
      const meta = saves.meta();
      await startTown({ lines: meta.lines ?? [], save: saves.bytes(), awayMs: Math.max(0, Date.now() - (meta.at || Date.now())) });
      town.cmd({ kind: 'releaseAll' });     // a save made mid-play: back in town view, they carry on by themselves
      enterGod(town.roster.households[meta.household] ?? town.roster.households[0]);
    for (const id of game.household.members) if (town.roster.people[id].design) wantFace(town.roster.people[id]);
      const days = town.caughtUp / town.roster.clock.ticksPerDay;
      if (days > 0.04) shell.toast(`The town carried on without you: ${days >= 1 ? `${days.toFixed(1)} days` : `${Math.round(days * 24)} hours`}.`);
    },
    start() { unlockSound(); worldView.setBuildingHeight(1); drive.testCarOn(true); game.screen = 'drive'; game.driving = true; input.inGame = true; shell.screen('drive'); hud.show(false); touch.mode('car'); touch.useLabel(null); touch.show(wantsTouch()); god.active = false; if (!town.roster) startTown({ seed: 1 }); town.cmd({ kind: 'liveAdd', model: extra.player }); },
    toDrive() { if (!town.roster) return; if (town.inRoom && !coop.isHost() && !coop.room?.players.find(p => p.id === town.owner)?.perms.drive) { shell.toast('The host has not said you can drive.'); return; } game.deselect(); drive.testCarOn(true); const c = god.target; drive.teleportToRoad(c.x, c.z); drive.setView('chase'); game.start(); },
    toGod() { worldView.setBuildingHeight(GOD_HEIGHT); game.driving = false; game.screen = 'god'; touch.show(false); shell.screen('god'); hud.show(true); camera.up.set(0, 1, 0); const p = drive.pos; god.goTo(p.x, p.z); drive.testCarOn(false); if (testLive != null) { town.cmd({ kind: 'liveDrop', id: testLive }); testLive = null; } },
    /** Jump into someone. Free and unlimited (rule 2); the clock drops to 1x (rule 1). */
    takeOver(id) {
      if (hands.on || id < 0) return;
      if (game.speed !== 1 && !town.inRoom) game.setSpeed(1);
      const q = people.spots.get(id);
      voice.unlock();
      hands.take(id, q && !q.hidden && !q.car ? q : null);
    },
    handBack() { hands.handBack(); },
    phoneOpen() { phone.open(); },
    happeningOpen() { phone.app('happening'); },
    handsTap(x, y) { if (game.screen === 'hands' && !document.querySelector('.modal')) hands.tap(x, y); },
    partyMenu() { partyMenu(); },
    radioMenu() { radioMenu(); },
    carMenu() { carMenu(); },
    handsMenu() {
      const box = shell.modal({ title: shortName(hands.me), body: [], buttons: [
        { label: 'Hand back', onClick: () => game.handBack() }, { label: 'Party', onClick: () => partyMenu() }, { label: 'Summon a car', onClick: () => carMenu() }, { label: 'Spells', onClick: () => spellMenu() }, { label: 'Change clothes', onClick: () => clothesMenu() }, ...(town.roster.jobs[town.roster.people[hands.me]?.job]?.beat ? [{ label: 'Radio', onClick: () => game.radioMenu() }] : []), { label: 'Phone', onClick: () => game.phoneOpen() }, ...(town.inRoom ? [{ label: 'Friends', onClick: () => coop.sheet() }] : []), { label: 'Keep going', quiet: true },
      ] });
      return box;
    },
    toTitle() { creator.close(); if (hands.on) hands.handBack(); if (town.inRoom) { coop.leave(); town.leaveRoom(); } game.saveNow(); shell.closeAll(); game.driving = false; game.screen = 'title'; input.inGame = false; touch.show(false); hud.show(false); god.active = false; game.deselect(); bubbles.clear(); shell.screen('title'); refreshTitle(); },
    toggleView() { if (game.screen === 'hands') { hands.toggleView(); return; } drive.setView(drive.view === 'top' ? 'chase' : 'top'); shell.toast(drive.view === 'top' ? 'Top-down. Up is north.' : 'Behind the car'); },
    rescue() { drive.rescue(); },
    setVolume(v) { sounds?.setVolume?.(v); voice.setVolume(v); if (v > 0) unlockSound(); },
    setTierSetting(v) { applyTier(chooseTier(v, facts)); },
    capture() { try { renderer.render(scene, camera); const c = document.createElement('canvas'), k = Math.min(1, 480 / canvas.width); c.width = canvas.width * k; c.height = canvas.height * k; c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.6); } catch { return null; } },
    perfReport: () => perf.report(),
    state: () => state(),
    /** In a room nobody sets the clock alone: this asks everyone (rule 1). `quiet`: the game itself wants 1x, which a room already is. */
    setSpeed(x, quiet = false) { if (town.inRoom) { if (!quiet) coop.askSpeed(x); return; } game.speed = x; town.setSpeed(x); hud.speed(x); },
    roomSpeed(x) { game.speed = x; hud.speed(x); },
    /** Select someone. `go` also brings the camera to them. */
    /** Selecting someone brings the camera in until you can really see them; it never pulls back out. */
    select(id, go = false) {
      game.selected = id; people.selected = id; game.info = null; game.following = false; god.follow = null; hud.following(false);
      for (const b of document.querySelectorAll('.od-fam')) b.classList.toggle('on', Number(b.dataset.id) === id);
      if (id >= 0) {
        voice.unlock();
        chatterHello(id);
        hud.person(id, town.roster.people[id], null, null, town);
        hud.hint('Tap a place or a person to give an order');
        refreshInfo();
        game.jumpTo(id);
        god.zoomTo(SELECT_DIST);
      } else { hud.person(-1); hud.hint(''); }
      void go;
    },
    deselect() { if (game.selected >= 0) game.select(-1); },
    async jumpTo(id) {
      const q = people.spots.get(id);
      if (q && !q.hidden) { god.goTo(q.x, q.z); return; }
      // indoors or far away: go to where the sim says they are
      const info = await town.inspect(id), at = info?.at >= 0 ? info.at : info?.trip?.to ?? town.roster.people[id].home, pl = town.roster.places[at];
      const row = pl && plans(pl.building), spot = row && info?.act?.spot != null && info.act.spot !== -1 ? (info.act.spot >= 0 ? row.slots[info.act.spot] : row.floor[-2 - info.act.spot]) : null;
      if (spot) { const b = buildingById.get(pl.building), q = toWorld({ cx: b.x, cz: b.z, yaw: b.yaw }, spot.x, spot.z); god.goTo(q.x, q.z); } else if (pl) god.goTo(pl.x, pl.z);
    },
    toggleFollow() { game.following = !game.following; hud.following(game.following); god.follow = game.following ? () => people.selectedSpot : null; if (game.following) game.jumpTo(game.selected); },
    clearOrders() { town.cmd({ kind: 'cancelOrders', who: game.selected }); setTimeout(refreshInfo, 300); },
    orderName(o) { if (o.kind === 'home') return 'Go home'; if (o.kind === 'work') return 'Go to work'; if (o.kind === 'chat') return `Chat with ${town.roster.people[o.person].name.split(' ')[0]}`; if (o.kind === 'use') return town.roster.actions[o.action]?.verb ?? o.action; return `Go to ${placeName(town.roster.places[o.place])}`; },
    tellSelf() { showOrders({ kind: 'self' }, town.roster.people[game.selected].name.split(' ')[0]); },
    tap(x, y) {
      if (document.querySelector('.modal')) return;
      const hit = tapAt(x, y);
      if (game.selected < 0) { if (hit?.kind === 'person') game.select(hit.id); return; }
      if (!hit) { game.deselect(); return; }
      if (hit.kind === 'person') {
        if (hit.id === game.selected) return game.tellSelf();
        const other = town.roster.people[hit.id];
        return showOrders({ kind: 'person', id: hit.id, name: other.name }, other.name, { label: `Look at ${other.name.split(' ')[0]} instead`, run: () => game.select(hit.id) });
      }
      const id = hit.kind === 'park' ? hit.block.id : hit.b.id;
      const places = town.roster.places.filter(p => p.building === id);
      if (places.length) showOrders({ kind: 'place', places }, placeName(places[0]));
    },
    inRoom: () => town.inRoom,
    playTogether: () => coop.title(),
    friends: () => coop.sheet(),
    personName: id => shortName(id),
    heardLine(id, d) { talk?.heard(id, d); chatter.othersSaid(); },
    /** Everyone worth offering a joiner first: the host's household, then the gallery's. */
    freePeople() { const r = town.roster, hh = [...(game.household?.members ?? []), ...r.households.filter(h => h.premade).flatMap(h => h.members)]; return [...new Set(hh)]; },
    soloSave: () => (saves.has() ? saves.meta() : null),
    /** ?room=, or Join with a code: a town that is not yours. */
    async joinRoom(code) {
      unlockSound();
      const ok = await startTown({ link: coop.linkFor({ type: 'join', code }) });
      if (!ok) { await backToTitleSolo(); return false; }
      enterGod(town.roster.households.find(h => h.premade) ?? town.roster.households[0]);
      coop.afterRoom();
      return true;
    },
    /** From the title: the town you have saved goes up to the server. */
    async hostSaved() {
      unlockSound();
      const meta = saves.meta(), text = await gunzipText(saves.bytes());
      const ok = await startTown({ lines: meta.lines ?? [], link: coop.linkFor(coop.hostFirst({ seed: 1, save: text, lines: meta.lines ?? [] })) });
      if (!ok) { await backToTitleSolo(); return; }
      enterGod(town.roster.households[meta.household] ?? town.roster.households[0]);
      coop.sheet();
    },
    /** From inside a game on your own: hand back, send the town up, carry on as the same person. */
    async hostLive() {
      const was = hands.on ? hands.me : -1, h = game.household, lines = talk?.dump?.() ?? [];
      if (hands.on) { hands.handBack(); await new Promise(r => setTimeout(r, 400)); }
      shell.closeAll();
      const m = await town.saveText();
      shared = m.hash;
      const ok = await startTown({ lines, link: coop.linkFor(coop.hostFirst({ seed: 1, save: m.text, lines })) });
      if (!ok) { await startTown({ save: m.text, lines }); enterGod(town.roster.households[h.id]); shell.toast('Could not open the room. Your town is fine.'); return; }
      enterGod(town.roster.households[h.id]);
      if (was >= 0) setTimeout(() => game.takeOver(was), 500);
      coop.sheet();
    },
    /** Take the town home: it comes back as the server's exact save, and carries on in your own browser. */
    async homeAgain(m) {
      homeSeen = { hash: m.hash, size: m.text.length };
      const h = game.household?.id ?? 0;
      await startTown({ save: m.text, lines: m.lines ?? [] });
      town.cmd({ kind: 'releaseAll' });
      enterGod(town.roster.households[h] ?? town.roster.households[0]);
      setTimeout(() => game.saveNow(), 400);
      shell.toast('Your town is home.');
    },
    async fromBackup(b) {
      const bytes = Uint8Array.from(atob(b.b64), ch => ch.charCodeAt(0));
      await startTown({ save: bytes });
      town.cmd({ kind: 'releaseAll' });
      enterGod(town.roster.households[b.household] ?? town.roster.households[0]);
    },
    /** Sent out of a room, or the room has gone. */
    outOfRoom() { if (hands.on) hands.reset(); town.leaveRoom(); game.driving = false; game.screen = 'title'; input.inGame = false; touch.show(false); hud.show(false); hhud.show(false); god.active = false; game.deselect(); bubbles.clear(); shell.closeAll(); shell.screen('title'); document.body.classList.remove('od-playing'); refreshTitle(); },
    /** A person you made has arrived in the room: go and be them. */
    becomeNew(e) { enterGod(e.house); setTimeout(() => { game.select(e.row.id); game.takeOver(e.row.id); }, 300); },
    simEvent(e) {
      if (HANDS_EVENTS.has(e.kind)) hands.event(e);
      if (FIGHT_EVENTS.has(e.kind)) { fightEvent(e); }
      if (e.kind === 'moment') { momentBeat(e.m); return; }
      if (e.kind === 'sheet') { shell.toast(`The Odd Sheet, issue ${e.no}, is out. It is on your Phone.`); return; }
      if (e.kind === 'home.moved') { const h = town.roster.households[e.household]; if (h) { h.home = e.home; for (const id of h.members) town.roster.people[id].home = e.home; } return; }
      if (e.kind === 'mech.empty' && e.ext) { if (e.who === hands.me) shell.toast('Nothing left to do with that.'); return; }
      if (JOB_EVENTS.has(e.kind)) jobs.event(e);
      siteSound(e);
      if (e.kind === 'moved.in') { movedIn(e); return; }
      if (e.kind === 'person.added') { personAdded(e); return; }
      if (e.kind === 'person.edited') { personEdited(e); return; }
      if (e.kind === 'spell') { magicAt(e); return; }
      if (e.kind === 'spell.wait' && e.who === hands.me) { shell.toast('That spell needs a moment.'); return; }
      if (e.kind === 'scene.start') { sceneOffer(e); return; }
      if (e.kind === 'scene.done') { if (stage.on) stage.result(e.ok ? 'It went well.' : 'It did not go well.'); return; }
      if (e.kind === 'stir.start' && game.screen === 'god' && !stage.on) stage.play({ scene: town.roster.stirScene[e.stir], a: e.a, b: e.b, place: town.mirror.people.get(e.a)?.at ?? -1 });
      if (e.kind === 'stir.done' && stage.on) stage.result(e.ok ? 'It went well.' : 'It did not go well.');
      if (e.kind === 'stir.start') chatter.bark(e.a, `od_stir_${e.stir}`);
      else if (e.kind === 'stir.done') { chatter.bark(e.b, `od_stir_${e.stir}_${e.ok ? 'ok' : 'bad'}`); if (town.roster.households[town.roster.people[e.a].household].id === game.household?.id || town.roster.households[town.roster.people[e.b].household].id === game.household?.id) refreshDots(); }
      else if (e.kind === 'newjob' && town.roster) town.roster.people[e.who].job = e.job;
      if (e.kind === 'car.back' || e.kind === 'car.gone') hands.carEvent(e);
      if (e.kind === 'live.added' && e.owner === town.owner) { testLive = e.live; return; }
      if (e.kind === 'order.failed' && e.who === game.selected) { shell.toast(`${shortName(e.who)} could not do that.`); chatter.bark(e.who, 'od_refuse'); }
      else if (e.kind === 'order.done' && e.who === game.selected) refreshInfo();
      else if (e.kind === 'tow' && people.spots.get(e.who) && !people.spots.get(e.who).hidden) chatter.bark(e.who, 'od_towed');
    },
    async saveNow() {
      if (!town.roster || game.household == null || town.inRoom) return false;     // a room is kept by the server; `coop.backup` keeps a copy for the host
      const m = await town.save(Date.now());
      return saves.write(new Uint8Array(m.bytes), { household: game.household.id, premade: game.household.premade, name: game.household.title, day: town.mirror.day, minute: town.mirror.minute, lines: talk?.dump?.() ?? [] });
    },
  };
  const shortName = id => town.roster.people[id].name.split(' ')[0];
  const gameDay = () => { const c = town.roster?.clock; return c ? town.mirror.t / c.ticksPerDay : 0; };
  function talkWords() { const n = newsText(), roster = town.roster; return { name: shortName, place: id => n.place(id), job: id => { const t = roster.jobs[id]?.title ?? 'in work'; return `${/^[aeiou]/i.test(t) ? 'an' : 'a'} ${t.toLowerCase()}`; }, cause: id => n.causeWord(id), prank: id => newsTable.pranks[id] ?? 'did something unspeakable', ago: d => (d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 7 ? `${d} days ago` : 'last week') }; }
  /** A household changed: the page's roster keeps up. */
  function movedIn(e) {
    const r = town.roster, from = r.households[e.from], to = r.households[e.to], p = r.people[e.who];
    from.members = from.members.filter(id => id !== e.who); to.members = [...to.members, e.who]; p.household = e.to; p.home = e.home;
    for (const car of e.cars ?? []) { from.cars = from.cars.filter(id => id !== car); to.cars = [...to.cars, car]; }
    if (game.household?.id === e.to || game.household?.id === e.from) { const h = r.households[game.household.id]; game.household.members = h.members; people.household = new Set(h.members); hud.family(h.members, town); }
  }
  // ---- the creator: everything it needs from the game
  let madeNext = null;
  /** A newcomer: the page's roster grows by one, as the sim's did. */
  function personAdded(e) {
    const r = town.roster, row = e.row; r.people[row.id] = row; r.households[e.house.id] = e.house;
    wantFace(row);
    if (coop.personAdded(e)) return;
    if (madeNext?.go) { madeNext = null; enterGod(e.house); game.saveNow(); shell.toast(`${shortName(row.id)} has moved in.`); setTimeout(() => game.select(row.id), 400); return; }
    if (game.household?.id === e.house.id) { game.household.members = e.house.members; people.household = new Set(e.house.members); hud.family(e.house.members, town); }
    shell.toast(`${shortName(row.id)} has moved in.`);
  }
  function personEdited(e) {
    const r = town.roster, row = e.row, was = r.people[row.id]; r.people[row.id] = row;
    portraits.delete(was?.look); wantFace(row);
    if (game.household?.members?.includes(row.id)) hud.family(game.household.members, town);
    if (game.selected === row.id) { hud.person(-1); hud.person(row.id, row, game.info, null, town); }
  }
  const creatorLists = { traits: peopleData.traits.map(t => t.id), quirks: peopleData.quirks };
  let names = null;       // Name Forge, the first time someone asks: a page with no creator open never loads it
  async function suggestName(race, gender) {
    const list = l => l[Math.floor(Math.random() * l.length)], plain = () => `${list(peopleData.given[gender])} ${list(peopleData.family)}`;
    if (race === 'human' || race === 'halfling' || race === 'beast') return plain();
    try {
      names ??= await (async () => { const { NameGen } = await import('../../../../namegen/js/namegen.js'); return NameGen.load(new URL('../../../../namegen/data/', import.meta.url).href); })();
      for (let i = 0; i < 12; i++) { const seed = (Math.random() * 1e9) | 0, g = names.generate('person.given', { race, gender, seed }).text, f = names.generate('person.family', { race, gender, seed: seed + 1 }).text, full = `${g} ${f}`; if (!/ember|veil/i.test(full) && full.length <= 28) return full; }
    } catch (e) { console.warn('[oddhaven] names', e); }
    return plain();
  }
  const jobRows = () => [{ v: 'auto', name: 'Whatever is going' }, ...jobsData.jobs.filter(j => !j.fallback).map(j => ({ v: j.id, name: j.title })), { v: 'none', name: 'Retired (63 and over)' }];
  const creator = createCreator({ THREE, renderer, shell: { modal: o => shell.modal(o), toast: t => shell.toast(t) }, voice, profileFor, lists: creatorLists, suggestName,
    randomOne: () => randomDesign((Math.random() * 1e9) | 0, { presets, people: peopleData }),
    onDone(cmd, c) {
      const fromTitle = c.back === 'title';
      if (c.editing != null) { town.cmd({ kind: 'editPerson', who: c.editing, ...cmd }); toTown(); shell.toast('Saved.'); return; }
      if (fromTitle) { const pick = cmd.household; game.screen = 'title'; game.beginMade({ ...cmd, household: null }, pick === 'new' ? null : pick); return; }
      town.cmd({ kind: 'addPerson', ...cmd, household: cmd.household === 'new' ? null : cmd.household }); coop.rememberMe({ ...cmd, household: null }); toTown();
    },
    onCancel(c) { if (c.back === 'title') { game.screen = 'title'; shell.screen('title'); } else toTown(); } });
  function toTown() { game.screen = 'god'; shell.screen('god'); hud.show(true); input.inGame = true; }
  function openCreator(opts) {
    if (hands.on) hands.handBack();
    shell.closeAll(); game.deselect(); game.screen = 'creator'; shell.screen('creator'); hud.show(false); touch.show(false);
    creator.start(opts);
  }
  game.makePerson = () => {
    const fromTitle = game.screen === 'title', r = town.roster;
    const guest = town.inRoom && !coop.isHost();      // a guest's person gets a home of their own: moving in with someone is the host's to allow
    const households = guest ? [{ v: 'new', name: 'A home of their own' }] : fromTitle ? [{ v: 'new', name: 'A home of their own' }, ...premades.households.map(h => ({ v: h.id, name: h.name }))]
      : [{ v: 'new', name: 'A home of their own' }, ...(game.household ? [{ v: game.household.id, name: game.household.title }] : []), ...r.households.filter(h => h.members.length && h.premade && h.id !== game.household?.id).map(h => ({ v: h.id, name: premades.households.find(x => x.id === h.premade)?.name ?? h.name }))];
    openCreator({ design: randomDesign((Math.random() * 1e9) | 0, { presets, people: peopleData }), households, jobs: jobRows(), household: fromTitle || guest ? 'new' : game.household?.id ?? 'new', job: 'auto' });
    creator.back(fromTitle ? 'title' : 'town');
  };
  game.clothesMenu = () => clothesMenu();
  game.editPerson = id => { const p = town.roster.people[id]; openCreator({ design: { ...looks.designOf(p), name: p.name }, editing: id }); creator.back('town'); };
  async function clothesMenu() {
    const me = hands.me, list = el('div', { class: 'od-list' }), box = shell.modal({ title: 'Change clothes', body: [list], buttons: [{ label: 'Not now', quiet: true }] }), inside = !!feet.inside(hands.you.x, hands.you.z);
    if (!inside) list.append(el('p', { class: 'od-tip', text: 'Find a door first: nobody changes on the pavement.' }));
    for (const w of ['work', ...WEAR_KINDS]) list.append(el('button', { class: 'od-big', type: 'button', ...(inside ? {} : { disabled: '' }), text: WEAR_NAMES[w], on: { click: () => { box.close(); town.cmd({ kind: 'wear', who: me, wear: w, indoors: true }); } } }));
  }
  /** Sparkles where a spell went off, for a second, and a word from whoever cast it. */
  const magic = [];
  function magicAt(e) {
    const q = people.spots.get(e.target) ?? people.spots.get(e.who);
    if (q && !q.hidden) { magic.push({ x: q.x, y: q.y, z: q.z, left: 1.2 }); if (magic.length > 3) magic.shift(); chatter.bark(e.who, `od_spell_${e.spell}_${e.ok ? 'ok' : 'bad'}`); }
    if (e.who === hands.me) hands.clip('wave');
  }
  /** The sim has brought two people together. Near you, or yours: a card with a Watch button. Nothing interrupts by itself. */
  function sceneOffer(e) {
    if (stage.on || game.screen !== 'god' || !town.roster) return;
    const mine = game.household?.members?.includes(e.a) || game.household?.members?.includes(e.b), pl = town.roster.places[e.place], near = pl && Math.hypot(pl.x - god.target.x, pl.z - god.target.z) < 160;
    if (!mine && !near) return;
    momentCard.offerWatch(`${shortName(e.a)} and ${shortName(e.b)}: ${town.roster.scenes[e.scene].label.toLowerCase()}`, () => stage.play({ ...e, scene: e.scene }));
  }
  async function spellMenu() {
    const me = hands.me, info = await town.inspect(me), list = el('div', { class: 'od-list' }), box = shell.modal({ title: 'Spells', body: [list], buttons: [{ label: 'Not now', quiet: true }] });
    if (info.wrong > 30) list.append(el('p', { class: 'od-tip', text: `In this mood, about ${info.wrong} in 100 of these will go wrong.` }));
    for (const row of info.spells) {
      const S = town.roster.spells[row.id], label = `${S.label}${row.target >= 0 && row.target !== me ? `: ${shortName(row.target)}` : ''}`;
      list.append(el('button', { class: 'od-big', type: 'button', ...(row.off ? { disabled: '' } : {}), text: row.off ? `${label}: ${row.off}` : label, on: { click: () => { box.close(); hands.syncNow(); town.cmd({ kind: 'cast', who: me, spell: row.id, ...(row.target !== undefined ? { target: row.target } : null) }); chatter.bark(me, `od_spell_${row.id}_cast`); } } }));
    }
  }
  const refreshDots = () => {};
  function stirMenu(a, b) {
    if (a === b) return;
    const A = town.roster.people[a], B = town.roster.people[b], list = el('div', { class: 'od-list' }), box = shell.modal({ title: `${shortName(a)} and ${shortName(b)}`, body: [list], buttons: [{ label: 'Never mind', quiet: true }] });
    for (const row of stirRows({ id: b }, town.roster)) list.append(el('button', { class: 'od-big', type: 'button', text: row.label, on: { click: () => { box.close(); giveOrder(a, row.order); } } }));
    void A; void B;
  }
  /** False if a room would not have us: the town is whatever it was before, and the caller goes on alone. */
  async function startTown(opts) {
    cars.reset(); people.reset(); bubbles.clear(); hands.reset();
    const roster = await town.start({ townData, ...opts });
    if (!roster) return false;
    news = null; momentCard.hide();
    talk = null;
    createTalk({ seed: town.roster.people.length * 7 + (opts.seed || 1), day: gameDay }).then(t => { talk = t; if (opts.lines) t.load?.(opts.lines); t.onSaid = town.inRoom ? (id, d) => town.post({ type: 'said', id, d }) : null; });
    game.speed = 1; hud.speed(1); if (!town.inRoom) town.setSpeed(1);
    return true;
  }
  /** The room would not have us, or there is no server. The game on your own is still all there. */
  async function soloInstead() { shell.toast('Could not reach the room. Playing on your own.'); }
  async function backToTitleSolo() { await town.start({ townData, seed: 1 }); game.outOfRoom(); }
  function enterGod(h) {
    const homePl = town.roster.places[h.home], pre = premades.households.find(x => x.id === h.premade);
    game.household = { ...h, title: pre?.name ?? `The ${h.name} household` };
    people.household = new Set(h.members);
    hud.family(h.members, town);
    god.goTo(homePl.x, homePl.z, 26);
    worldView.setBuildingHeight(GOD_HEIGHT);
    game.screen = 'god'; game.driving = false; input.inGame = true;
    shell.screen('god'); hud.show(true); hud.speed(game.speed); touch.show(false);
  }
  const chatterHello = id => { if (voiceHeard.has(id) || !talk?.ready) return; voiceHeard.add(id); chatter.bark(id, moodBark(id)); };
  const voiceHeard = new Set();
  const moodBark = id => { const m = town.mirror.people.get(id)?.mood ?? 0.6; return m > 0.75 ? 'od_happy' : m < 0.35 ? 'od_sad' : 'od_greet'; };
  async function refreshInfo() {
    const id = game.selected; if (id < 0) return;
    const info = await town.inspect(id);
    if (id !== game.selected) return;
    game.info = info;
    hud.person(id, town.roster.people[id], info, null, town);
  }
  function tapAt(x, y) {
    const r = god.ray(x, y);
    return pick({ sx: x, sy: y, people: people.drawn(), project, ray: r, ground: god.groundUnder(x, y), buildings: things, parks, reach: Math.max(28, 44 - god.dist * 0.2) });
  }
  function showOrders(target, title, extra = null) {
    const id = game.selected, who = town.roster.people[id];
    const rows = ordersFor({ who: { ...who, id }, target, roster: town.roster, minute: town.mirror.minute });
    const list = el('div', { class: 'od-list' });
    if (target.kind === 'self') list.append(el('button', { class: 'od-big od-takeover', type: 'button', text: 'Take over', on: { click: () => { shell.closeAll(); game.takeOver(id); } } }), el('button', { class: 'od-big', type: 'button', text: 'Change how they look', on: { click: () => { shell.closeAll(); game.editPerson(id); } } }));
    const box = shell.modal({ title, body: [list], buttons: [...(extra ? [{ label: extra.label, quiet: true, onClick: extra.run }] : []), { label: 'Never mind', quiet: true }] });
    for (const row of rows) list.append(el('button', { class: 'od-big', type: 'button', ...(row.off ? { disabled: '' } : {}), text: row.off ? `${row.label}: ${row.off}` : row.label, on: { click: () => { box.close(); giveOrder(id, row.order); } } }));
  }
  function giveOrder(id, order) {
    if ((game.info?.orders?.length ?? 0) >= 3) { shell.toast('They already have three things to do.'); return; }
    town.cmd({ kind: 'order', who: id, order });
    chatter.bark(id, 'od_ack');
    setTimeout(refreshInfo, 400);
  }
  let lastTown = null, testLive = null, homeSeen = null, shared = null;
  const wantsTouch = () => facts.mobile || matchMedia('(pointer: coarse)').matches || params.has('touch');
  const shell = createShell({ game });
  const hud = createGodHud({ parent: shell.root, game, portrait: portraitOf });
  let stageSpeed = 1;
  const stage = createStage({ camera, town, people, god, talk: () => talk, voice, voiceOn: () => settings.voices !== 'off' && settings.sound > 0, profileFor, bubbles, el, parent: shell.root, buildings: buildingById, words: () => talkWords(),
    setHud: v => hud.show(v), onBegin() { stageSpeed = game.speed; if (game.speed !== 1 && !town.inRoom) game.setSpeed(1); people.stage = stage.stage; }, onEnd() { if (game.speed !== stageSpeed && !town.inRoom) game.setSpeed(stageSpeed); people.stage = null; } });
  const hhud = createHandsHud({ parent: shell.root, game });
  let coop = null;
  createKeyNav();
  const carName = m => extras.get(m)?.name ?? m;
  // ---- playing someone: everything main.js needs to know about it
  const JOB_EVENTS = new Set(['work.done', 'shift.in', 'shift.out', 'fire.done', 'call.done', 'law.done', 'law.answer', 'duty.paid', 'fight.down', 'fight.over']);
  const FIGHT_EVENTS = new Set(['fight.hit', 'fight.kill', 'fight.skill', 'fight.wave', 'fight.hurt', 'fight.miss', 'fight.seal', 'fight.blow', 'fight.wind', 'fight.down', 'law.ran', 'law.caught', 'law.pulled', 'permit.done', 'rift.signs', 'rift.open', 'rift.closed', 'arrested', 'ticket', 'warned', 'pet.found', 'calmed']);
  const HANDS_EVENTS = new Set(['took.done', 'car.summoned', 'car.seat', 'car.full', 'swapped', 'recap', 'cmd.refused', 'ride.out', 'mech.paid', 'mech.empty', 'owner.moved', 'car.owner', 'car.left', 'party.over']);
  const hands = createHands({ THREE, scene, camera, town, world, net, drive, cars, types, vdefs, paths, roads, feetIn: feet, project, plans, shut: doorShut, ui: {
    liftMenu() { liftMenu(); },
    parkedNear: () => parkedRows,
    started(id, inCar, quiet = false) {
      game.deselect(); bubbles.clear();
      game.screen = 'hands'; god.active = false; input.inGame = true;
      hud.show(false); hhud.show(true); hhud.who(town.roster.people[id].name); hhud.hint('');
      setDriving(inCar); touch.show(wantsTouch());
      if (!quiet) lastTown = null;
      document.body.classList.add('od-playing');
    },
    inCar: on => setDriving(on),
    ended(at) {
      game.driving = false; game.screen = 'god'; touch.show(false); hhud.show(false); shell.screen('god'); hud.show(true); hud.speed(game.speed);
      worldView.setBuildingHeight(GOD_HEIGHT); camera.up.set(0, 1, 0); god.goTo(at.x, at.z, 30); god.active = true;
      document.body.classList.remove('od-playing');
    },
    say: t => shell.toast(t),
    nameOf: shortName,
    recap(e, front) { if (!front || game.screen !== 'god') return; const card = recapCard(e, town.roster, carName); lastCard = shell.modal({ title: card.title, body: [el('ul', { class: 'od-recap' }, ...card.lines.map(t => el('li', { text: t })))], buttons: [{ label: 'Back to town' }] }); },
    async whileAway(id, since) { const info = await town.inspect(id), lines = diaryLines(info?.diary ?? [], since, town.roster); if (lines.length) hhud.note('While you were away', lines); },
    summoned(model, spot, rec) { shell.toast(`The ${carName(model)} is at the kerb, ${Math.round(spot.d)} m away.`); carOut = rec; },
    partyChanged() {},
    leader: () => coop.leader(),
    crewCars: () => coop.crewCars(),
    taken() {},
  } });
  people.hands = hands;
  coop = createCoop({ game, town, shell, el, hands, people, cars, params, project, parent: shell.root, premades });
  coop.mount(shell.burger);
  // sounds through the shared library: one-shots only, loaded on first use
  let sfxLib = null, sfxAsked = false;
  const sfx = id => { if (settings.sound === 0) return; if (!sfxAsked) { sfxAsked = true; Sfx.create({ method: 'hybrid', volume: settings.sound }).then(l => { sfxLib = l; }).catch(e => console.warn('[oddhaven] sfx', e)); } sfxLib?.cue?.(id); };
  const siteSound = e => {
    if (e.kind === 'tree.down' || e.kind === 'saw' || e.kind === 'cart.sent') {
      const c = hands.on ? hands.pos : god.target, far = Math.hypot(c.x - timber.T.landing[0], c.z - timber.T.landing[1]);
      if (far < 160) { if (e.kind === 'tree.down') sfx('wood.chop'); else if (e.kind === 'cart.sent') sfx('lever.pull'); }
    }
  };
  const useHeld = () => input.keys.has('KeyE') || touch.useHeld || [...(navigator.getGamepads?.() ?? [])].some(g => g?.buttons[2]?.pressed);
  const jobs = createJobHands({ town, hands, timber, plans, buildings: buildingById, held: useHeld, placeWord: id => newsText().place(id), hud: hhud, say: t => shell.toast(t), sfx, clip: n => hands.clip(n), bookSheet: C => bookSheet(C), lightsOn: () => town.mirror.live.some(r => r[6] === hands.me && r[9]),
    truckAt: me => { const car = me.van; const row = town.mirror.parked.get(car), live = town.mirror.live.find(r => r[7] === car), p = hands.pos, yard = town.roster.places.some(pl => pl.kind === 'lumber_yard' && Math.hypot(pl.x - p.x, pl.z - p.z) < 26); return { inCab: !!hands.car && hands.car.car === car, load: town.mirror.site?.trucks?.[car] ?? 0, nearYard: yard, parked: !!row, live: !!live }; } });
  hands.jobs = jobs;
  const phone = createPhone({ showPerson: id => { if (!hands.on) game.select(id); }, patch: (a, b) => { if (!hands.on) stirMenu(a, b); }, watch: r => stage.play({ scene: r.scene, a: r.a, b: r.b, place: r.place }), town, world, shell, el, hands, say: t => shell.toast(t), whose: () => { const id = hands.on ? hands.me : game.selected >= 0 ? game.selected : game.household?.members?.[0] ?? -1; return { who: id, household: id >= 0 ? town.roster.people[id].household : game.household?.id ?? 0 }; }, goTo: (x, z) => { if (hands.on) hands.routeTo({ x, z }); else { god.goTo(x, z, 60); } }, handsMenu: { party: () => partyMenu(), car: () => carMenu(), spells: () => spellMenu(), friends: () => coop.sheet() }, news: newsText, jumpTo: r => jumpInto(r.jump) });
  // ---- Moments: the sim notices, the page decides what may catch your eye. Nothing here pauses anything
  function newsText() { return (news ??= createNews(newsTable, town.roster)); }
  let news = null;
  const momentCard = createMomentCard({ parent: shell.root, el, news: newsText, firstName: shortName, household: () => game.household, onJump: m => jumpInto(m.jump) });
  function momentBeat(m) { if (town.roster) momentCard.offer(m, town.mirror.t, town.mirror.day); }
  /** Fade straight in: hand back whoever you are, take whoever the Moment is about. */
  function jumpInto(id) {
    if (id < 0) return;
    shell.fade();
    if (hands.on) { if (hands.me === id) return; hands.handBack(); setTimeout(() => game.takeOver(id), 80); } else game.takeOver(id);
  }
  let lastCard = null, carOut = null;
  const parkedTests = [];
  function setDriving(on) {
    game.driving = on;
    shell.screen(on ? 'drive' : 'hands'); hhud.show(true);
    worldView.setBuildingHeight(1);       // on the street a building is its real size; only what stands between you and the camera comes down (occluders)
    touch.mode(on ? 'car' : 'foot');
    if (on) carOut = null;
  }
  function liftMenu() {
    const box = feet.inside(hands.you.x, hands.you.z), plan = box && plans(box.b.id); if (!plan) return;
    const list = el('div', { class: 'od-list' }), sheet = shell.modal({ title: 'Lift', body: [list], buttons: [{ label: 'Stay here', quiet: true }] });
    for (let lv = 0; lv < plan.levels; lv++) list.append(el('button', { class: 'od-big', type: 'button', ...(lv === hands.you.lv ? { disabled: '' } : {}), text: lv ? `Floor ${lv}` : 'Ground floor', on: { click: () => { sheet.close(); hands.toFloor(lv); } } }));
  }
  /** The radio: what is open, nearest first, and the car. Keys and a pad walk it like any sheet. */
  function radioMenu() {
    const me = hands.me, row = town.roster.people[me], job = town.roster.jobs[row.job], p = hands.pos, list = el('div', { class: 'od-list' }), box = shell.modal({ title: 'Radio', body: [list], buttons: [{ label: 'Over and out', quiet: true }] }), W = newsText();
    const near = (a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z), add = (text, run, off = false) => list.append(el('button', { class: 'od-big', type: 'button', ...(off ? { disabled: '' } : {}), text, on: { click: () => { box.close(); run(); } } }));
    const mine = (town.mirror.calls ?? []).find(C => C.by === me), onShift = town.mirror.people.get(me) && shiftNow(row);
    list.append(el('p', { class: 'od-tip', text: onShift ? 'On shift. Pick one up, or leave it and someone else will.' : 'Off shift. You can still take one: the pay comes in with the hours you put in.' }));
    if (mine) add(`Hand back: ${callName(mine.k)}`, () => town.cmd({ kind: 'law', who: me, verb: 'drop' }));
    const van = vanFree(row);
    const vanName = { law: 'patrol car', rift: 'jeep', medic: 'ambulance' }[job.beat];
    if (!hands.car) add(van === null ? `The ${vanName} is out` : `Bring the ${vanName} here`, () => hands.summon(van), van === null);
    if (job.beat === 'rift') for (const R of (town.mirror.rifts ?? []).slice().sort(near)) add(`${R.st === 'signs' ? 'Odd sky' : 'Rift open'}: ${W.place(R.place)}, ${Math.round(Math.hypot(R.x - p.x, R.z - p.z))} m`, () => { hands.routeTo({ x: R.x, z: R.z }); });
    if (job.beat !== 'rift') { const open = (town.mirror.calls ?? []).filter(C => C.st === 'open' && (C.job ?? 'officer') === row.job).sort(near); if (!open.length && !mine) list.append(el('p', { class: 'od-tip', text: 'Quiet on the radio.' })); for (const C of open.slice(0, 5)) add(`${callName(C.k)}: ${W.place(C.place)}, ${Math.round(Math.hypot(C.x - p.x, C.z - p.z))} m`, () => { town.cmd({ kind: 'law', who: me, verb: 'take', id: C.id }); chatter.bark(me, 'od_radio_take'); }, !!mine); }
    return box;
  }
  const VANS = { law: 'police_car', rift: 'trail_jeep', medic: 'ambulance' };
  const shiftNow = row => { const job = town.roster.jobs[row.job], [a, b] = job.shifts[row.shift ?? 0], m = town.mirror.minute / 60; return a < b ? m >= a && m < b : m >= a || m < b; };
  function vanFree(row) { const model = VANS[town.roster.jobs[row.job].beat]; if (row.van === undefined) return null; for (const [car, q] of town.mirror.parked) if (q.model === model && q.at === row.work) return car; return null; }
  /** The end of a call: three short rows, the same list by thumb, key or pad. */
  function bookSheet(C) {
    const me = hands.me, list = el('div', { class: 'od-list' }), box = shell.modal({ title: `${shortName(C.who)}: what is it to be?`, body: [list], buttons: [{ label: 'Not yet', quiet: true }] });
    const go = (how, pool) => { box.close(); hands.syncNow(); town.cmd({ kind: 'law', who: me, verb: 'step', how }); chatter.bark(me, pool); hands.clip('lifeLift'); };
    list.append(el('button', { class: 'od-big', type: 'button', text: `Ticket: ${C.fine} coins, if they can spare it`, on: { click: () => go('ticket', 'od_law_ticket') } }), el('button', { class: 'od-big', type: 'button', text: 'A warning', on: { click: () => go('warn', 'od_law_warn') } }));
    if (C.arrest || C.ran) list.append(el('button', { class: 'od-big', type: 'button', text: 'Arrest: a night in the cells', on: { click: () => go('arrest', 'od_law_arrest') } }));
  }
  /** Every blow and every word of a fight or a call, on screen and in your ears. The sim has already decided all of it. */
  function fightEvent(e) {
    riftView.event(e);
    const near = (x, z, r = 90) => { const c = hands.on ? hands.pos : god.target; return Math.hypot(x - c.x, z - c.z) < r; }, spot = id => { const q = people.spots.get(id); return q && !q.hidden ? q : null; };
    switch (e.kind) {
      case 'fight.hit': { const q = spot(e.who); if (q) { if (e.who === hands.me) sfx(e.crit ? 'melee.crit' : 'melee.hit'); else { hands.partyClip(e.who, 'lifeChop'); const row = town.mirror.people.get(e.who); if (row) row.strikeT = town.mirror.t + 3; if (q.car == null && Math.random() < 0.12) chatter.bark(e.who, 'od_fight_hit'); } } return; }
      case 'fight.skill': { const q = spot(e.who); if (q) { magic.push({ x: e.x, y: q.y + 1, z: e.z, left: 0.7 }); if (magic.length > 3) magic.shift(); sfx('status.barrier.apply'); if (Math.random() < 0.5) chatter.bark(e.who, 'od_fight_skill'); } return; }
      case 'fight.kill': if (near(e.x, e.z)) sfx('death.beast'); return;
      case 'fight.wave': shell.toast('Here they come.'); sfx('bell.toll'); return;
      case 'fight.hurt': if (e.who === hands.me) { sfx('melee.block'); hands.clip('shrug'); if (Math.random() < 0.3) chatter.bark(e.who, 'od_fight_hurt'); } return;
      case 'fight.miss': if (e.who === hands.me) sfx('melee.miss'); return;
      case 'fight.seal': sfx('door.grind'); return;
      case 'fight.down': { const q = spot(e.who); if (q) { chatter.bark(e.who, 'od_fight_down'); sfx('death.humanoid'); } return; }
      case 'law.ran': { const q = spot(e.who); if (q) chatter.bark(e.who, 'od_law_run'); if (hands.on && town.roster.jobs[town.roster.people[hands.me].job]?.beat === 'law') shell.toast('They ran!'); return; }
      case 'law.caught': { chatter.bark(e.who, 'od_law_caught'); return; }
      case 'law.pulled': { chatter.bark(e.who, 'od_law_excuse'); if (e.by === hands.me) shell.toast('They have pulled over. Get out and have a word.'); return; }
      case 'permit.done': if (e.owner === town.owner) { shell.toast('Permit granted.'); sfx('coin'); } return;
      case 'rift.signs': if (near(e.x, e.z, 200)) { sfx('night.ambush'); for (const q of people.shown.slice(0, 2)) chatter.bark(q.id, 'od_rift_signs'); } return;
      case 'rift.open': if (near(e.x, e.z, 220)) { sfx('bell.toll'); for (const q of people.shown.slice(0, 3)) chatter.bark(q.id, 'od_rift_panic'); } return;
      case 'rift.closed': if (hands.on && (e.crew ?? []).includes(hands.me)) { sfx('quest.complete'); chatter.bark(hands.me, 'od_rift_sealed'); hhud.note(e.how === 'sealed' ? 'Sealed' : 'It is over', [`${e.kills} down${e.each ? `, ${e.each} coins in finds` : ''}`], 7000); } return;
      case 'ticket': case 'arrested': case 'warned': if (e.who != null && spot(e.who)) chatter.bark(e.who, 'od_law_excuse'); return;
      case 'pet.found': if (e.person != null && spot(e.person)) chatter.bark(e.person, 'od_law_pet_thanks'); return;
      case 'calmed': if (e.who === hands.me) chatter.bark(e.who, 'od_law_calm'); return;
      default: 
    }
  }
  async function partyMenu() {
    const me = town.roster.people[hands.me], info = await town.inspect(hands.me), h = town.roster.households[me.household], list = el('div', { class: 'od-list' }), inParty = new Set(hands.party.keys());
    const friends = (info?.feelings ?? []).filter(f => f.like >= 30 && town.roster.people[f.person].household !== me.household).sort((a, b) => b.like - a.like).slice(0, 5).map(f => f.person);
    const box = shell.modal({ title: 'Party', body: [list], buttons: [{ label: 'Done', quiet: true }] });
    const row = (label, run) => list.append(el('button', { class: 'od-big', type: 'button', text: label, on: { click: () => { box.close(); run(); } } }));
    for (const id of inParty) { row(`Play as ${shortName(id)}`, () => hands.swapTo(id)); row(`Let ${shortName(id)} go`, () => hands.dropFromParty(id)); }
    for (const id of [...h.members, ...friends]) if (id !== hands.me && !inParty.has(id)) row(`Bring ${shortName(id)}`, () => hands.addToParty(id));
    for (const [label, run] of coop.partyRows()) row(label, run);
    if (!list.children.length) list.append(el('p', { class: 'od-tip', text: 'Nobody to bring along yet. Friends show up here.' }));
  }
  async function carMenu() {
    const info = await town.inspect(hands.me), list = el('div', { class: 'od-list' });
    const box = shell.modal({ title: 'Summon a car', body: [list], buttons: [{ label: 'Never mind', quiet: true }] });
    for (const c of info?.cars ?? []) {
      const out = c.at < 0;
      list.append(el('button', { class: 'od-big', type: 'button', ...(out ? { disabled: '' } : {}), text: out ? `${carName(c.model)}: out` : carName(c.model), on: { click: () => { box.close(); hands.summon(c.id); } } }));
    }
    if (!list.children.length) list.append(el('p', { class: 'od-tip', text: 'This household has no car.' }));
  }
  shell.gallerySlot.append(createGallery({ households: premades.households, portrait: premadePortrait, onPick: h => game.begin(h) }));
  people.seen = q => !!project(q.x, q.y + 0.9, q.z);
  addEventListener('keydown', e => { if (e.code === 'KeyJ' && coop.asked && !/INPUT|TEXTAREA/.test(e.target?.tagName || '')) { e.preventDefault(); coop.yes(); } });
  const refreshTitle = () => shell.continueWith(saves.has() ? saves.meta() : null, () => game.resume());
  refreshTitle();
  shell.screen('title');

  function applyTier(name) {
    if (name === tierName) return;
    tierName = name; const S = TIERS[name];
    renderer.setPixelRatio(Math.min(devicePixelRatio, S.dpr));
    renderer.shadowMap.enabled = S.shadows; sun.castShadow = S.shadows;
    scene.fog.near = S.fogNear; scene.fog.far = S.fogFar; camera.far = S.fogFar + 30; camera.updateProjectionMatrix();
    scene.traverse(o => { if (o.material?.needsUpdate !== undefined) o.material.needsUpdate = true; });
    worldView.setTier(name); fireView.setTier(name); resize();
  }
  function resize() {
    renderer.setPixelRatio(Math.min(devicePixelRatio, TIERS[tierName].dpr));
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.fov = innerHeight > innerWidth ? 68 : 58; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  // ---- day and night: only the light, and only as much as a clock needs
  const hemi = scene.children.find(o => o.isHemisphereLight);
  const dayColour = new THREE.Color('#a8cfe6'), duskColour = new THREE.Color('#d9926a'), nightColour = new THREE.Color('#1b2536'), bgc = new THREE.Color();
  function daylight(minute) {
    const h = minute / 60, up = Math.sin((h - 6) / 13 * Math.PI), day = Math.max(0, Math.min(1, up * 2.2 + 0.25));
    sun.intensity = 0.25 + day * 2.05; hemi.intensity = 0.55 + day * 0.95;
    const dusk = Math.max(0, 1 - Math.abs(up - 0.05) * 5) * (h > 3 ? 1 : 0);
    bgc.copy(nightColour).lerp(dayColour, day).lerp(duskColour, dusk * 0.6);
    scene.background = bgc; scene.fog.color.copy(bgc).lerp(dayColour, day * 0.4);
  }

  // ---- doors open: which buildings are cut open this frame, and the cars parked round them
  const cuts = new Map();     // building id -> { b, lv, k, focus }
  let godLv = 0, godBuilding = null, turnDrag = null, parkedRows = [], parkClock2 = 1, near = [];
  const shutters = world.buildings.filter(b => plans(b.id)?.shutter);
  /** The floor a person is on, by what the sim says they are doing. */
  function personIndoors(id) {
    const p = town.mirror.people.get(id);
    if (!p || p.at == null || p.at < 0 || p.sp == null || p.sp === -1) return null;
    const pl = town.roster.places[p.at], plan = plans(pl.building), row = plan && (p.sp >= 0 ? plan.slots[p.sp] : plan.floor[-2 - p.sp]);
    return row ? { b: buildingById.get(pl.building), lv: row.lv ?? 0 } : null;
  }
  function wanted(inGod, inHands, c) {
    const out = [];
    if (inHands && !hands.car && hands.riding == null) {
      const you = hands.you, atDoor = q => { for (const d of plans(q.b.id)?.doors ?? []) { if (d.a !== 'out') continue; const w = toWorld(q, d.x, d.z); if (Math.hypot(w.x - you.x, w.z - you.z) < 1.6) return true; } return false; };
      const near = feet.inside(you.x, you.z, 1.7), box = feet.inside(you.x, you.z) ?? (near && atDoor(near) ? near : null);
      if (box) out.push({ b: box.b, lv: you.lv, focus: you });
    }
    if (inGod) {
      const sel = game.selected >= 0 && god.dist < 130 ? personIndoors(game.selected) : null, under = god.dist < 60 ? feet.inside(god.target.x, god.target.z) : null;
      const b = sel?.b ?? under?.b ?? null;
      if (b) {
        if (godBuilding !== b.id) { godBuilding = b.id; godLv = sel?.lv ?? 0; } else if (sel && game.following) godLv = sel.lv;
        if (sel && sel.b === b && lastSel !== game.selected) { godLv = sel.lv; lastSel = game.selected; }
        out.push({ b, lv: Math.min(godLv, (plans(b.id)?.levels ?? 1) - 1), focus: sel ? c : god.target });
      } else godBuilding = null;
    }
    return out;
  }
  let lastSel = -1;
  // What stands between the camera and the person you are looking at comes down far enough to see over, and goes back up after: full height everywhere else.
  const veil = new Map(), nearBuildings = [];
  const camTarget = (inGod, inHands) => { if (inHands && !hands.car && hands.riding == null) return hands.you; if (inGod && game.selected >= 0) { const q = people.selectedSpot; return q ?? null; } return null; };
  function occluders(open, dt, inGod, inHands) {
    const t = camTarget(inGod, inHands), want = new Map();
    if (t) for (const b of nearBuildings) {
      if (open.some(r => r.b === b)) continue;
      const k = occludeK(b, t, camera.position, inGod ? GOD_HEIGHT : 1);
      if (k > 0) want.set(b.id, { b, k });
    }
    for (const [id, row] of want) if (!veil.has(id)) veil.set(id, { b: row.b, k: 0 });
    for (const [id, row] of veil) { const aim = want.get(id)?.k ?? 0; row.k += (aim - row.k) * Math.min(1, dt * 8); if (!want.has(id) && row.k < 0.01) veil.delete(id); }
    return [...veil.values()].sort((a, b) => b.k - a.k);
  }
  function doorsOpen(inGod, inHands, c, dt) {
    const want = wanted(inGod, inHands, c), ids = new Set(want.map(w => w.b.id));
    for (const w of want) { const had = cuts.get(w.b.id); if (had) { had.lv = w.lv; had.focus = w.focus; had.gone = false; } else cuts.set(w.b.id, { b: w.b, lv: w.lv, k: 0, focus: w.focus }); }
    openLv.clear();
    const list = [];
    for (const [id, row] of cuts) {
      row.k = Math.max(0, Math.min(1, row.k + (ids.has(id) ? dt : -dt) * 4));
      if (row.k <= 0 && !ids.has(id)) { cuts.delete(id); continue; }
      list.push(row);
      if (ids.has(id)) openLv.set(id, row.lv);
    }
    worldView.setCut([...list.slice(0, 3), ...occluders(list, dt, inGod, inHands)].slice(0, 3));
    viewFloor = inGod ? [...openLv.values()][0] ?? 0 : 0;
    const up = Math.sin((town.mirror.minute / 60 - 6) / 13 * Math.PI), day = Math.max(0, Math.min(1, up * 2.2 + 0.25)), folk = [];
    if (list.length) {
      for (const q of people.shown) folk.push({ x: q.x, z: q.z, lv: q.lv ?? 0 });
      if (inHands) folk.push({ x: hands.you.x, z: hands.you.z, lv: hands.you.lv });
    }
    interiors.show(list.filter(r => r.k > 0.15).slice(0, 3), camera, day, dt, folk, near);
    return list.length > 0;
  }
  /** Parked cars near the camera, and the shut shops: looked up twice a second, never in the frame. */
  function looksRound(c, dt) {
    parkClock2 += dt; if (parkClock2 < 0.5 || !town.roster) return; parkClock2 = 0;
    const rows = [], taken = new Map(), R2 = 150 * 150, mine = hands.on ? town.roster.people[hands.me].household : -1, H = town.roster.households;
    for (const [car, { at, model }] of town.mirror.parked) {
      const pl = town.roster.places[at], b = pl && buildingById.get(pl.building);
      if (!b?.parking?.length || (b.x - c.x) ** 2 + (b.z - c.z) ** 2 > R2) continue;
      if ((types.get(model)?.len ?? 4.5) > 6.5 && !b.parking[0].truck && model !== 'fire_truck') continue;      // an artic will not fit a front yard: it is kept at the yard behind the shops
      // the first free spot this vehicle really fits: a garage takes what goes through its door, the rest stand on the drive
      const used = taken.get(b.id) ?? new Set(), dims = types.get(model), n = b.parking.findIndex((q, i) => !used.has(i) && (!q.inside || (dims && fitsGarage(dims)))), spot = b.parking[n];
      if (n >= 0) used.add(n); taken.set(b.id, used);
      if (!spot || (spot.inside && !openLv.has(b.id))) continue;
      rows.push({ truck: !!spot.truck || model === 'fire_truck', car, type: model, x: spot.x, y: feet.ground(spot.x, spot.z), z: spot.z, yaw: spot.yaw, inside: !!spot.inside, mine: mine >= 0 && H[mine].cars.includes(car) });
    }
    // an engine at a fire stands in the road, not in somebody's yard
    for (const F of town.mirror.fires ?? []) { const C = F.call; if (C?.st === 'scene' && C.live == null) { const i = rows.findIndex(r => r.car === C.engine); if (i >= 0) rows.splice(i, 1); rows.push({ truck: true, car: C.engine, type: 'fire_truck', x: C.spot.x, y: feet.ground(C.spot.x, C.spot.z), z: C.spot.z, yaw: C.spot.yaw, inside: false, mine: false }); } }
    parkedRows = rows; cars.setParked(rows); feet.parked = rows;
    near = shutters.filter(b => !cuts.has(b.id) && (b.x - c.x) ** 2 + (b.z - c.z) ** 2 < 4900);
    nearBuildings.length = 0; for (const b of world.buildings) if ((b.x - c.x) ** 2 + (b.z - c.z) ** 2 < 3600) nearBuildings.push(b);
  }

  // ---- the frame
  let siteClock = 0, wasModal = false, last = performance.now(), simTime = 0, slow = 0, pile = null, kmh = 0, frozen = false, wasJump = false, wasBoost = false, focusClock = 0, infoClock = 0, saveClock = 0, padUsed = false, parkClock = 0;
  const focus = new THREE.Vector3();
  // the free test car counts to traffic like any live car: rail cars brake behind it, and the reset rule still applies
  function reportTestCar(dt) {
    parkClock += dt; if (parkClock < 0.25 || testLive == null) return; parkClock = 0;
    const p = drive.pos, v = drive.veh.forwardSpeed(), L = feet.lane(p.x, p.z, 3.4), row = [testLive, +p.x.toFixed(2), +p.z.toFixed(2), +drive.yaw.toFixed(2), +v.toFixed(2)];
    town.cmd({ kind: 'pos', cars: [L ? [...row, L.edge, L.fwd, L.at] : row] });
  }
  function frame(now, { fixedDt = null } = {}) {
    if (frozen && fixedDt == null) return;
    const dt = fixedDt ?? Math.min(0.1, (now - last) / 1000), ms = now - last; last = now;
    const t0 = performance.now();
    const s = input.read(dt);
    if (s.menu && game.screen !== 'title') shell.toggleMenu();
    const inGod = game.screen === 'god', modal = !!document.querySelector('.modal');
    if (game.driving && !drive.autopilot) {
      if (s.reset) drive.rescue();
      if (s.horn) sounds?.play('horn');
      if (s.map) game.toggleView();
    }
    const simSpeed = town.turbo || game.speed;
    cars.step(dt, simSpeed);
    const inMenu = !game.driving || modal, inHands = game.screen === 'hands';
    if ((inHands || inGod) && s.swap && coop.asked) { coop.yes(); s.swap = false; }      // Y on a pad: yes to the bar, with a sheet open or not
    if ((inHands || inGod) && s.swap && !modal && momentCard.open) { momentCard.jump(); s.swap = false; }      // Y on a pad: jump in
    if (inHands && s.swap && !modal) game.handsMenu();
    if (inHands && !game.driving && s.map && !modal) game.toggleView();
    if (inHands) { hands.frame(dt, s, modal); const t = hands.useLabel(); touch.useLabel(t); handsHints(); } else hands.frame(dt, s, true);
    drive.frame(dt, s, { traffic, poses: trafficView.poses, types, inMenu: inMenu && !drive.autopilot });
    hands.settleCars();       // the picture of a live car is the pose physics just made, not last frame's
    if (game.screen === 'drive') reportTestCar(dt);
    simTime += dt;
    const t1 = performance.now();
    if (inGod && s.device === 'pad' && !modal && !wasModal) {     // the press that closed a list must not also tap the town behind it
      padUsed = true;
      if (s.jump && !wasJump) game.tap(innerWidth / 2, innerHeight / 2);
      if (s.boost && !wasBoost) game.deselect();
      if (s.use && game.selected >= 0) game.tellSelf();      // the list starts with Take over
      if (s.swap) game.setSpeed([1, 2, 4, 0][([0, 1, 2, 4].indexOf(game.speed))]);
    }
    wasJump = s.jump; wasBoost = s.boost; wasModal = modal;
    if (inGod) hud.reticle(padUsed && s.device === 'pad');
    if (inGod && s.map && !modal) game.phoneOpen();
    if (inGod && s.hitch && !modal) stepFloor(godLv + 1 >= (plans(godBuilding)?.levels ?? 1) ? -99 : 1);
    if (inGod) hud.floor(godBuilding ? plans(godBuilding)?.levels ?? 1 : 1, godLv);
    if (game.screen === 'creator') { creator.frame(dt, now); perf.frame(ms, { rules: t1 - t0, picture: 0, draw: 0 }); return; }
    if (game.screen === 'title') { perf.frame(ms, { rules: t1 - t0, picture: 0, draw: 0 }); return; }  // nothing to draw behind the gallery
    if (!modal && (inGod || inHands)) turnCamera(dt, inHands);
    if (inGod) god.update(dt, modal ? null : s, !modal && !stage.on);
    if (inGod) { stage.frame(dt); stage.pad(s); stage.camera(dt); }
    else { god.active = false; if (game.driving || drive.autopilot) drive.camera(dt, s); else if (inHands) hands.camera(dt, modal ? {} : s); }
    camera.updateMatrixWorld();
    const p = inHands ? hands.pos : drive.pos, c = inGod ? { x: god.target.x, y: groundY(god.target.x, god.target.z), z: god.target.z } : p;
    focus.set(c.x, c.y, c.z);
    sun.position.copy(focus).addScaledVector(sunDir, 140); sun.target.position.copy(focus);
    if (inGod) {
      const S = TIERS[tierName];
      scene.fog.near = Math.max(S.fogNear, god.dist * 1.25); scene.fog.far = Math.max(S.fogFar, god.dist * 3.2);
      if (camera.far < scene.fog.far + 30) { camera.far = scene.fog.far + 30; camera.updateProjectionMatrix(); }
    } else if (scene.fog.far !== TIERS[tierName].fogFar) {
      const S = TIERS[tierName]; scene.fog.near = S.fogNear; scene.fog.far = S.fogFar; camera.far = S.fogFar + 30; camera.updateProjectionMatrix();
    }
    daylight(town.mirror.minute);
    looksRound(focus, dt);
    if (town.roster && game.screen !== 'title' && doorsOpen(inGod, inHands, focus, dt)) hemi.intensity = Math.max(hemi.intensity, 1.3);     // people in a lit room are lit
    worldView.update(focus, dt, camera);
    if (town.roster) { siteClock += dt; timber.update(dt, town.tick(), siteClock); jobs.frame(dt); fightHud(dt, s, modal); fireFrame(dt, focus); riftView.update(dt, fireSeconds, focus, hands.on ? hands.you : null); if (inGod) { const n = town.mirror.now ?? []; hud.now(n[0] ? happeningLine(n[0], town.roster, newsText()) : '', n.length); } }
    trafficView.update(camera, dt, tierName, pile);
    people.update(focus, camera, dt, stage.on ? 20 : inGod ? god.dist : openLv.size ? 24 : 40, simSpeed);    // close in a room: faces, not weather signs
    chatter.update(dt, inGod ? god.dist : 40, simSpeed);
    coop.frame(dt);
    bubbles.update(dt, id => { const q = people.spots.get(id); return q && !q.hidden ? q : null; });
    if (town.roster) {
      focusClock += dt;
      if (focusClock > 0.5) { focusClock = 0; town.cmd({ kind: 'focus', points: [{ x: focus.x, z: focus.z }], party: hands.on ? hands.ids() : game.selected >= 0 ? [game.selected] : [] }); }
      hud.time(town.mirror.minute, town.mirror.day); hhud.time(town.mirror.minute, town.mirror.day);
      infoClock += dt; if (infoClock > 1 && game.selected >= 0) { infoClock = 0; refreshInfo(); }
      saveClock += dt; if (saveClock > 30) { saveClock = 0; game.saveNow(); }
    }
    // the engine is heard only with someone at the wheel: it used to idle in every view, on foot and in town view too
    if (sounds) { const fs = game.driving ? Math.abs(drive.veh.forwardSpeed()) : 0; sounds.engines?.(game.driving ? [{ id: 'me', kind: engineVoice(drive.veh.def), rpm: Math.min(1, fs / drive.veh.def.engine.top), load: Math.max(drive.veh.input.throttle, 0.04), slide: 0, at: p, mine: true }] : [], { x: p.x, y: p.y, z: p.z }); }
    kmh = Math.round(drive.speed * 3.6); shell.speed(kmh);
    const t = world.towns.find(c2 => Math.hypot(focus.x - c2.x, focus.z - c2.z) < c2.radius * 1.35);
    if (game.screen !== 'title' && (t?.id ?? null) !== lastTown) { lastTown = t?.id ?? null; shell.showPlace(t ? t.name : 'County Road'); }
    const t2 = performance.now();
    renderer.render(scene, camera);
    const t3 = performance.now();
    perf.frame(ms, { rules: t1 - t0, picture: t2 - t1, draw: t3 - t2 });
    soak?.frame();
    // a device that cannot hold the frame rate on high is moved to low
    if (settings.tier === 'auto' && !forced && tierName === 'high' && !document.hidden) { slow = ms > 42 ? slow + dt : Math.max(0, slow - dt); if (slow > 8) { slow = 0; applyTier('low'); shell.toast('Graphics set to Low to keep things smooth.'); } }
  }
  // Q and E turn the camera; E only when there is nothing to use (it stays the use key). Right-drag turns it with the mouse
  const held = new Set();
  let eHeldFree = false;
  addEventListener('keydown', e => { if (/INPUT|TEXTAREA/.test(e.target?.tagName || '')) return; if (e.code === 'KeyE' && !e.repeat) eHeldFree = !hands.useLabel(); held.add(e.code); if (e.code === 'PageUp' || e.code === 'BracketRight') stepFloor(1); if (e.code === 'PageDown' || e.code === 'BracketLeft') stepFloor(-1); });
  addEventListener('keyup', e => held.delete(e.code));
  addEventListener('blur', () => held.clear());
  function turnCamera(dt, inHands) {
    if (!inHands) return;    // town view turns itself (god.js)
    const k = (held.has('KeyQ') ? -1 : 0) + (held.has('KeyE') && eHeldFree ? 1 : 0);
    if (k) hands.yaw += k * dt * 1.8;
  }
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => { if (e.button === 2) { turnDrag = { x: e.clientX }; try { canvas.setPointerCapture(e.pointerId); } catch { /* not a live pointer */ } } });
  canvas.addEventListener('pointermove', e => { if (!turnDrag) return; const dx = e.clientX - turnDrag.x; turnDrag.x = e.clientX; if (game.screen === 'hands') hands.yaw -= dx * 0.006; else if (game.screen === 'god') god.yaw -= dx * 0.006; });
  const endTurn = () => { turnDrag = null; };
  canvas.addEventListener('pointerup', endTurn); canvas.addEventListener('pointercancel', endTurn);
  function stepFloor(by) {
    if (game.screen !== 'god' || !godBuilding) return;
    const n = plans(godBuilding)?.levels ?? 1;
    godLv = Math.max(0, Math.min(n - 1, godLv + by));
    hud.floor(n, godLv);
  }
  game.stepFloor = stepFloor;
  function loop(now) { requestAnimationFrame(loop); if (!document.hidden) frame(now); else last = now; }

  function state() {
    const p = drive.pos, m = town.mirror, tp = town.stats;
    const cs = cars.stats();
    return { build: BUILD, screen: game.screen, pos: [+p.x.toFixed(1), +p.y.toFixed(2), +p.z.toFixed(1)], yaw: +drive.yaw.toFixed(3), kmh, view: drive.view, tier: tierName, dpr: renderer.getPixelRatio(),
      traffic: cs, carsDrawn: trafficView.stats.drawn, carsNear: trafficView.stats.near, bodies: people.stats.bodies, standIns: people.stats.standIns, bodiesBuilt: people.bodiesBuilt, outside: people.stats.outside,
      draws: perf.draws, tris: perf.tris, roadTris: worldView.stats.roadTris, buildingTris: worldView.stats.buildingTris, autopilot: !!drive.autopilot,
      sim: { running: !!town.roster, t: m.t, day: m.day, minute: m.minute, speed: game.speed, turbo: town.turbo, snaps: town.snaps, rows: m.people.size, cars: m.cars.length, tickMs: +(tp.avgMs ?? 0).toFixed(3), tickMax: +(tp.maxMs ?? 0).toFixed(2), people: town.roster?.people.length ?? 0, households: town.roster?.households.length ?? 0 },
      indoors: { open: interiors.stats.open, tris: interiors.stats.tris, parts: interiors.stats.parts, drawn: people.stats.indoors, parked: parkedRows.length, lv: godLv, building: godBuilding }, hands: hands.state(), god: { yaw: +god.yaw.toFixed(2), dist: +god.dist.toFixed(1), target: [+god.target.x.toFixed(1), +god.target.z.toFixed(1)], selected: game.selected, moved: god.moved }, household: game.household?.title ?? null, talk: { ready: !!talk?.ready, lines: chatter.stats.lines, spoken: chatter.stats.spoken, voices: voice.spoken } };
  }

  /** The three buttons on keys and pad, the mode of the on-screen ones, and the row of people you could swap to. */
  let fJump = false, fBoost = false, fSwap = 0, wasFight = false;
  function fightHud(dt, s, modal) {
    const on = hands.on && !hands.car && !!jobs.fightOf(hands.me);
    hhud.radio(hands.on && !!town.roster.jobs[town.roster.people[hands.me]?.job]?.beat);
    if (on !== wasFight) { wasFight = on; touch.mode(on ? 'fight' : game.driving ? 'car' : 'foot'); if (!on) hhud.fightCrew([], () => {}); }
    if (!on) { fJump = s.jump; fBoost = s.boost; return; }
    const f = jobs.fightOf(hands.me), S = town.roster.monsters.skills[town.roster.people[hands.me].job] ?? town.roster.monsters.skills.default, tps = town.roster.clock.ticksPerSecond, tick = town.mirror.t;
    touch.skillInfo(S.name, Math.max(0, (f.F.s - tick) / tps), Math.max(0, (f.F.d - tick) / tps));
    if (!modal) {
      if (s.jump && !fJump) jobs.dodge();
      if (s.boost && !fBoost && s.device === 'pad') jobs.skill();
      if (s.hitch) { const ids = [...hands.party.keys()]; if (ids.length) { fSwap = (fSwap + 1) % ids.length; hands.swapTo(ids[fSwap]); } }
    }
    fJump = s.jump; fBoost = s.boost;
    hhud.fightCrew([...hands.party.keys()].map(id => { const r = town.mirror.people.get(id)?.fg; return { id, name: shortName(id), hp: r?.hp ?? 1, max: r?.max ?? 1, down: !!r?.down }; }), id => hands.swapTo(id));
    void dt;
  }
  const engineVoice = def => (def.id === 'motorcycle' ? 'bike' : /truck|ambulance/.test(def.id) ? 'truck' : 'car');
  // ---- fire: what the sim says is burning, on screen and in your ears
  let fireSeconds = 0, fireLoop = false, hoseClock = 0;
  const siren = createSiren();
  const wake = installAudioWake({ onDead() { voice.reset(); siren.reset(); sounds?.stopAll?.(); sounds = null; sfxLib = null; sfxAsked = false; unlockSound(); } });
  const streamList = [], sirenList = [];
  function fireFrame(dt, c) {
    fireSeconds += dt; streamList.length = 0; sirenList.length = 0;
    // a hose in play: yours, and anyone on the crew the sim says is spraying
    if (jobs.spraying) { const y = hands.you.yaw ?? 0, r = town.roster.fireWork.hoseReach, sy = hands.you.y + 1.2; streamList.push({ x: hands.you.x + Math.sin(y) * 0.6, y: sy, z: hands.you.z + Math.cos(y) * 0.6, tx: hands.you.x + Math.sin(y) * r, ty: sy - 1.4, tz: hands.you.z + Math.cos(y) * r }); }
    for (const q of people.shown) {
      const row = town.mirror.people.get(q.id);
      if (row?.tk?.k !== 'spray') continue;
      const F = town.mirror.fires?.find(f => f.call?.crew.includes(q.id)), plan = F && plans(F.b), room = plan?.rooms.find(r => r.id === row.tk.ref), b = F && buildingById.get(F.b);
      if (!room || !b) continue;
      const t = toWorld({ cx: b.x, cz: b.z, yaw: b.yaw }, (room.x0 + room.x1) / 2, (room.z0 + room.z1) / 2);
      streamList.push({ x: q.x, y: q.y + 1.2, z: q.z, tx: t.x, ty: q.y + 1, tz: t.z });
    }
    let loud = null;
    const heard = (x, z) => { const d = Math.hypot(x - c.x, z - c.z); if (loud === null || d < loud) loud = d; };
    for (const car of cars.cars) { if (!car.siren) continue; const q = cars.pose(car, {}); sirenList.push(q); heard(q.x, q.z); }
    // a live engine: where the picture is this frame. The sim's copy of a live car is four updates a second behind, which is why the lights trailed the truck
    for (const r of town.mirror.live) if (r[9] || (r[1] === 'fire_truck' && (town.mirror.fires?.some(F => F.call?.engine === r[7])))) { const car = cars.byLive.get(r[0]), q = car ? cars.pose(car, {}) : { x: r[2], y: feet.ground(r[2], r[3]), z: r[3], yaw: r[4] }; sirenList.push(q); heard(q.x, q.z); }
    for (const F of town.mirror.fires ?? []) if (F.call?.st === 'scene' && F.call.live == null) sirenList.push({ x: F.call.spot.x, y: feet.ground(F.call.spot.x, F.call.spot.z), z: F.call.spot.z, yaw: F.call.spot.yaw });
    for (let i = magic.length - 1; i >= 0; i--) { magic[i].left -= dt; if (magic[i].left <= 0) magic.splice(i, 1); }
    fireView.update(dt, fireSeconds, c, openLv, streamList, sirenList, magic);
    siren.set(loud, settings.sound);
    // the crackle, and the hose
    const nearFire = (town.mirror.fires ?? []).some(F => { const b = buildingById.get(F.b); return b && Math.hypot(b.x - c.x, b.z - c.z) < 90; });
    if (nearFire !== fireLoop) { fireLoop = nearFire; if (nearFire) sfxLoop('ambience.fire'); else sfxLib?.stopLoops?.(); }
    if (jobs.spraying) { hoseClock -= dt; if (hoseClock <= 0) { hoseClock = 1.6; sfx('water.pour'); } } else hoseClock = 0;
  }
  const sfxLoop = id => { sfx('fire.crackle'); sfxLib?.play?.(id).catch?.(() => {}); };

  // ---- ?soak=1
  let soak = null;
  const asked = soakAsked(location.search);
  sendLeftover(SOAK_URL);
  const autopilot = (cruise = 15) => {
    const s0 = spawnSpot(world, net);
    drive.autopilot = createAutopilot(net, { lane: s0.lane, seed: world.seed, cruise, prefer: (L, B) => B.county && Math.random() < 0.4 });
  };

  // ---- gameEye: Claude's own hook, and what the Playwright tests read
  window.gameEye = {
    state, world: { size: world.size, towns: world.towns, bridge: world.bridge, nodes: world.roadGraph.nodes.map(n => ({ id: n.id, x: n.x, z: n.z, y: n.y, degree: n.edges.length })) },
    start: () => game.start(), toTitle: () => game.toTitle(), teleport: (x, z, yaw, y) => drive.teleport(x, z, yaw, y), view: v => drive.setView(v), autopilot: on => { if (on) autopilot(); else drive.autopilot = null; },
    /** The sim: what the page is mirroring, and its own health check. */
    begin: id => game.begin(premades.households.find(h => h.id === id) ?? premades.households[0]), speed: x => game.setSpeed(x), turbo: x => town.setTurbo(x), health: () => town.health(), save: () => game.saveNow(), select: (id, go) => game.select(id, go), goTo: (x, z, d) => god.goTo(x, z, d),
    who: () => people.shown.map(q => ({ id: q.id, x: +q.x.toFixed(1), z: +q.z.toFixed(1), anim: q.anim, walking: q.walking, car: q.car?.id ?? null })), mirror: () => [...town.mirror.people.values()], roster: () => town.roster,
    screenOf: id => { const q = people.spots.get(id); return q && !q.hidden ? project(q.x, q.y + 0.8, q.z) : null; }, tapThing: (x, y) => { const h = tapAt(x, y); return h && { kind: h.kind, id: h.id ?? h.b?.id ?? h.block?.id }; },
    selected: () => game.info, saveSize: () => saves.meta(), wipeSave: () => saves.clear(),
    bark: (id, intent) => chatter.bark(id, intent), say: (id, text, opts) => voice.speak(profileFor({ ...town.roster.people[id], id }), text, opts).done, voice: () => ({ spoken: voice.spoken, rendered: voice.rendered }),
    /** M1's pass test: a parked truck across the bridge, both ways. Drawn, and the sim's traffic deals with it. */
    parkOnBridge() { const B = world.bridge, r = world.roads.find(x => x.id === B.road); town.cmd({ kind: 'placeObstacle', edge: r.id, pos: B.from + B.to, len: 16, dir: 0 }); const y = B.deck; cars.park({ type: types.has('semi_truck') ? 'semi_truck' : 'sedan', x: B.cx, y, z: B.cz, yaw: B.yaw }); },
    screenOfPlace: id => { const p = town.roster.places[id]; const b = world.buildings.find(x => x.id === p.building); return project(b ? b.x : p.x, 3, b ? b.z : p.z); }, toDrive: () => game.toDrive(), toGod: () => game.toGod(),
    tier: t => applyTier(t), perf: () => perf.report(), resetPeaks: () => perf.resetPeaks(),
    /** Stack 40 cars and the nearest crowd on one spot, the worst case the budget has to survive. */
    pile: on => { pile = on ? { x: focus.x, y: focus.y, z: focus.z } : null; people.pile = !!on; if (on) cars.pile(40); else cars.unpile(); },
    /** Draw calls and triangles at every junction, looking four ways, on the current tier. */
    sweep() {
      frozen = true;
      const out = [], was = drive.pos;
      for (const n of world.roadGraph.nodes) {
        if (n.edges.length < 3) continue;
        for (let k = 0; k < 4; k++) {
          const yaw = k * Math.PI / 2;
          drive.teleport(n.x, n.z, yaw, n.y); drive.cam.yaw = yaw; drive.cam.snap();
          frame(performance.now(), { fixedDt: 0.26 });
          out.push({ node: n.id, yaw: k, draws: renderer.info.render.calls, tris: renderer.info.render.triangles, cars: trafficView.stats.drawn, bodies: people.stats.bodies, standIns: people.stats.standIns });
        }
      }
      drive.teleport(was.x, was.z);
      frozen = false;
      out.sort((a, b) => b.draws - a.draws || b.tris - a.tris);
      return { worstDraws: out[0], worstTris: out.slice().sort((a, b) => b.tris - a.tris)[0], views: out.length };
    },
    frameOnce: (dt = 1 / 30) => frame(performance.now(), { fixedDt: dt }),
    /** M8. */
    coop, room: () => coop.stateOf(), roomPost: m => town.post(m), netCut: () => coop.cut(),
    rosterAll: () => town.roster, setMe: cmd => coop.rememberMe(cmd), randomMaker: () => makerOf(randomDesign(Math.floor(Math.random() * 1e6), { presets, people: peopleData }), { household: null }), spotOf: id => people.spots.get(id), mirrorLive: () => town.mirror.live, handJump: () => hands.handJump ?? null, tookAt: () => hands.tookAt ?? 0,
    lastShared: () => shared, keepHome: () => { homeSeen = null; }, homeSeen: () => homeSeen, saveMeta: () => saves.meta(),
    /** The longest straight lane on the map, for a car at speed: { x, z, y, yaw, len }. */
    longLane() { let best = null; for (const L of net.roads) { let i = 0; while (i + 3 < L.n) { const y0 = Math.atan2(L.x[i + 2] - L.x[i], L.z[i + 2] - L.z[i]); let j = i + 2; while (j + 2 < L.n && Math.abs(Math.atan2(Math.sin(Math.atan2(L.x[j + 2] - L.x[j], L.z[j + 2] - L.z[j]) - y0), Math.cos(Math.atan2(L.x[j + 2] - L.x[j], L.z[j + 2] - L.z[j]) - y0))) < 0.05) j += 2; const len = Math.hypot(L.x[j] - L.x[i], L.z[j] - L.z[i]); if (!best || len > best.len) best = { x: L.x[i], z: L.z[i], y: L.y[i], yaw: y0, len }; i = j; } } return best; },
    /** Your car on that lane, doing `v`. */
    putCar: (q, v = 0) => { const c = hands.car; c.veh.teleport([q.x, q.y + 0.9, q.z], q.yaw); c.veh.rb.setLinvel({ x: Math.sin(q.yaw) * v, y: 0, z: Math.cos(q.yaw) * v }, true); hands.snapCamera(); drive.cam.yaw = q.yaw; drive.cam.snap(); },
    moveFor: (code, ms) => new Promise(res => { dispatchEvent(new KeyboardEvent('keydown', { code })); input.keys?.add?.(code); setTimeout(() => { input.keys?.delete?.(code); dispatchEvent(new KeyboardEvent('keyup', { code })); res(); }, ms); }),
    summonHere: id => hands.summon(id), putMeBy: (q, d) => { hands.you.x = q.x + d; hands.you.z = q.z + d; hands.snapCamera(); },
    coopCarSpeed: () => { const c = cars.byLive.get(hands.seatIn); return Math.abs(c?.v ?? 0); },
    /** A home with a front door, to walk in by. */
    aHome: () => { const b = world.buildings.find(q => plans(q.id)?.doors?.some(d => d.a === 'out') && plans(q.id).units?.length === 0 || plans(q.id)?.levels === 1); const d = plans(b.id).doors.find(x => x.a === 'out'), w = toWorld({ cx: b.x, cz: b.z, yaw: b.yaw }, d.x, d.z); return { b: b.id, x: w.x, z: w.z, cx: b.x, cz: b.z }; },
    walkIn: d => { const k = 1.2 / Math.hypot(d.cx - d.x, d.cz - d.z); hands.you.x = d.x + (d.cx - d.x) * k; hands.you.z = d.z + (d.cz - d.z) * k; hands.you.lv = 0; hands.snapCamera(); },
    bodyFit: id => { const s = people.slots.find(q => q.pid === id), q = people.spots.get(id); return { inside: !!q?.inside, hidden: !!q?.hidden, scale: s ? +s.actor.group.scale.x.toFixed(2) : null, standIn: !s }; },
    /** M2. */
    take: id => game.takeOver(id), handBack: () => game.handBack(), use: () => hands.use(), partyAdd: id => hands.addToParty(id), partyDrop: id => hands.dropFromParty(id), swap: id => hands.swapTo(id), summon: id => hands.summon(id), strand: (id, x, z) => hands.strand(id, x, z), walkTo: (x, z) => hands.walkTo(x, z),
    camYaw: y => { hands.yaw = y; }, handYaw: () => hands.yaw, closeCard: () => shell.closeAll(), inspect: id => town.inspect(id), hop: () => hands.hopMs, owner: () => town.owner, railCar: id => { const c = cars.cars.find(k => k.driver === id && !k.gone); return c ? { id: c.id, ...cars.pose(c, {}) } : null; }, carPose: () => { const r = hands.car; return r ? { ...cars.pose(r.c, {}) } : null; }, nextPose: trip => { const c = cars.byTrip.get(trip); return c ? { ...cars.pose(c, {}) } : null; },
    carSpot: () => { const r = [...hands.recs.values()].at(-1); return r ? r.veh.rb.translation() : null; },
    putMe: (x, z) => { if (hands.car) { hands.car.veh.teleport([x, feet.ground(x, z) + 0.9, z], 0); } else { hands.you.x = x; hands.you.z = z; } hands.snapCamera(); },
    poseOfDriver: id => { const c = cars.cars.find(k => k.driver === id && !k.gone); return c ? { ...cars.pose(c, {}), live: c.liveId ?? null, trip: c.fixed ? null : c.id } : null; },
    /** Draw calls and triangles with a player and party on screen: every junction, four turns, near and far. */
    sweepHands() {
      frozen = true;
      const out = [], was = { x: hands.you.x, z: hands.you.z };
      for (const n of world.roadGraph.nodes) {
        if (n.edges.length < 3) continue;
        for (const view of ['near', 'far']) for (let k = 0; k < 4; k++) {
          hands.view = view; hands.yaw = k * Math.PI / 2; hands.you.x = n.x + 5; hands.you.z = n.z + 5; hands.you.y = feet.ground(n.x, n.z); hands.snapCamera();
          let i = 0; for (const f of hands.party.values()) { f.x = hands.you.x + 1.5 + i++; f.z = hands.you.z - 1; f.k = 1; }
          frame(performance.now(), { fixedDt: 0.26 });
          out.push({ node: n.id, view, yaw: k, draws: renderer.info.render.calls, tris: renderer.info.render.triangles, bodies: people.stats.bodies, standIns: people.stats.standIns, cars: trafficView.stats.drawn });
        }
      }
      hands.you.x = was.x; hands.you.z = was.z; hands.view = 'near'; hands.yaw = 0; hands.snapCamera();
      frozen = false;
      out.sort((a, b) => b.draws - a.draws || b.tris - a.tris);
      return { worstDraws: out[0], worstTris: out.slice().sort((a, b) => b.tris - a.tris)[0], views: out.length };
    },
    /** M4. */
    job: () => jobs.state(), site: () => town.mirror.site, timber: () => world.timber, phone: () => phone.state(), phoneApp: n => phone.app(n), now: () => town.mirror.now, stir: (a, b) => stirMenu(a, b), timberStats: () => timber.stats, screenOfPerson: id => { const q = people.spots.get(id); return q && !q.hidden ? project(q.x, q.y + 0.9, q.z) : null; },
    /** Draw calls and triangles at the forest and the mill, worst case: bodies at work, a tree coming down, logs everywhere. */
    sweepTimber() {
      frozen = true;
      const out = [], T = world.timber, spots = [[T.landing[0], T.landing[1] - 26], [T.landing[0], T.landing[1]], [T.deck[0], T.deck[1]], [T.benches[1].blade[0], T.benches[1].blade[1]], [T.rack[0], T.rack[1]], [T.centre[0], T.centre[1]]];
      for (const [x, z] of spots) for (const d of [26, 70]) for (let k = 0; k < 4; k++) {
        god.goTo(x, z, d); god.yaw = k * Math.PI / 2; game.screen = 'god'; god.active = true;
        frame(performance.now(), { fixedDt: 0.26 }); frame(performance.now(), { fixedDt: 0.26 });
        out.push({ x, z, d, k, draws: renderer.info.render.calls, tris: renderer.info.render.triangles, bodies: people.stats.bodies, standIns: people.stats.standIns, logs: timber.stats.logs, falling: timber.stats.falling });
      }
      god.yaw = 0; frozen = false;
      out.sort((a, b) => b.draws - a.draws || b.tris - a.tris);
      return { worstDraws: out[0], worstTris: out.slice().sort((a, b) => b.tris - a.tris)[0], views: out.length };
    },
    /** M7. */
    sheet: async ({ rows, cols, cell = 150, label = 14, avatar, name }) => {     // a contact sheet: rows x cols of whole bodies, on one canvas
      const c = document.createElement('canvas'); c.width = 70 + cols.length * cell; c.height = label + 6 + rows.length * cell;
      const x = c.getContext('2d'); x.fillStyle = '#cfe0ea'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#123'; x.font = `${label - 2}px sans-serif`;
      for (let k = 0; k < cols.length; k++) x.fillText(String(cols[k]).slice(0, 22), 72 + k * cell, label);
      for (let r = 0; r < rows.length; r++) {
        x.fillStyle = '#123'; x.fillText(String(rows[r]), 2, label + 6 + r * cell + cell / 2);
        for (let k = 0; k < cols.length; k++) x.drawImage(await faces.body(avatar(rows[r], cols[k]), cell), 70 + k * cell, label + 6 + r * cell);
      }
      void name; return c.toDataURL('image/jpeg', 0.86);
    },
    sheetUniform: (rows, cols) => window.gameEye.sheet({ rows, cols, avatar: (race, job) => designAvatar(fitRace(randomDesign(11, { presets, people: peopleData }), race), 'work', job) }),
    sheetWear: (rows, cols) => window.gameEye.sheet({ rows, cols, avatar: (race, wear) => designAvatar(fitRace(randomDesign(wear.length * 7, { presets, people: peopleData }), race), wear) }),
    sheetHat: (rows, cols) => window.gameEye.sheet({ rows, cols, avatar: (race, hat) => { const d = fitRace(randomDesign(23, { presets, people: peopleData }), race); d.wardrobe.casual.hat = { id: hat, color: '#c2493d' }; return designAvatar(d, 'casual'); } }),
    addMade: over => town.cmd({ kind: 'addPerson', ...makerOf(randomDesign(Math.floor(Math.random() * 1e6), { presets, people: peopleData }), { household: null }), ...over }), designFor: (race, seed) => fitRace(randomDesign(seed, { presets, people: peopleData }), race),
    pedals: () => ({ ...drive.input, view: drive.view, veh: drive.veh.input.brake, def: drive.veh.def.id, driver: drive.veh.driver, sleeping: drive.veh.rb.isSleeping() }), favour: ids => { people.household = new Set(ids); }, creator: () => creator.state(), creatorDesign: () => creator.design, makePerson: () => game.makePerson(), editPerson: id => game.editPerson(id), wardrobe: () => people.wardrobe, wearOf: id => people.wearOf(id), portraitStats: () => ({ made: faces.made }), portrait: a => faces.shot(a), avatarOf: (id, w) => looks.avatarFor(town.roster.people[id], w), premadeAvatar: (h, m) => looks.premadeAvatar(premades.households.find(x => x.id === h), m), faceKey: a => faceKey(a), premadeList: () => premades.households.map(h => ({ id: h.id, n: h.members.length })), forceWear: (who, wear) => town.cmd({ kind: 'wear', who, wear, indoors: true }), memory: () => ({ renderer: renderer.info.memory, programs: renderer.info.programs?.length ?? 0, heap: performance.memory?.usedJSHeapSize ?? null }), bodySlots: () => people.slots.map(s => ({ pid: s.pid, look: s.look, tris: s.actor.stats().triangles, fit: s.fit, tall: s.tall })),
    /** M6. */
    stage: () => stage.state(), stageSkip: () => stage.skip(), stageEnd: () => stage.end(), playScene: e => stage.play(e), watchNext: () => momentCard.jump(), talkStats: () => ({ ...(talk?.stats ?? {}), chatter: chatter.stats }), spellMenu: () => spellMenu(), cast: c => town.cmd({ kind: 'cast', ...c }), facts: (a, b) => town.facts(a, b), townSky: () => town.mirror.sky, signs: () => town.mirror.signs, sweepStage() { frozen = true; const out = []; for (let i = 0; i < 4; i++) { frame(performance.now(), { fixedDt: 0.26 }); out.push({ draws: renderer.info.render.calls, tris: renderer.info.render.triangles, bodies: people.stats.bodies, standIns: people.stats.standIns }); } frozen = false; return out; },
    /** The iPhone list. */
    garages: () => world.buildings.filter(b => b.garage).map(b => { const p = plans(b.id), r = p.rooms.find(q => q.kind === 'garage'), d = p.doors.find(q => q.kind === 'garage'); return { id: b.id, w: r.x1 - r.x0, d: r.z1 - r.z0, doorW: d.w, doorH: d.h }; }), parkedRows: () => parkedRows,
    audio: () => wake.contexts, audioStates: () => wake.states(), engineVoices: () => (game.driving ? 1 : 0), carHint: () => document.querySelector('.od-hhint')?.textContent ?? '', godDist: () => god.dist, selectedSeen: () => { const q = people.selectedSpot; return q ? project(q.x, q.y + 1, q.z) : null; }, carDims: () => Object.fromEntries([...types].map(([id, t]) => [id, { len: t.len, width: t.width, height: t.height }])), recSpot: () => { const r = [...hands.recs.values()].at(-1); if (!r) return null; const t = r.veh.rb.translation(); return { x: t.x, y: t.y, z: t.z, id: r.id, model: r.model, drawn: cars.byLive.get(r.id)?.fade, v: r.veh.forwardSpeed() }; }, veiled: () => [...veil.values()].map(r => ({ id: r.b.id, k: +r.k.toFixed(2) })), buildingHeight: () => worldView.buildingHeight, lightGap: () => { const out = []; for (const l of fireView.lastLights) { const r = [...hands.recs.values()].find(x => x.model === 'fire_truck'); if (r) { const t = r.veh.rb.translation(); out.push(Math.hypot(l.x - t.x, l.z - t.z)); } } return out; }, spawnParked: (model, x, z, yaw = 0) => { const def = vdefs.get(model), y = Math.max(feet.ground(x, z), world.heightAt(x, z)) + (types.get(model)?.lift ?? 0.6) + 0.1, veh = drive.spawn(def, { x, y, z, yaw, v: 0 }); parkedTests.push(veh); return parkedTests.length - 1; }, parkedSpot: i => { const b = parkedTests[i], t = b.rb.translation(), l = b.rb.linvel(); return { x: +t.x.toFixed(2), y: +t.y.toFixed(2), z: +t.z.toFixed(2), v: +b.forwardSpeed().toFixed(2), ly: +l.y.toFixed(2), sleep: b.rb.isSleeping() }; },
    /** M9. */
    calls: () => town.mirror.calls, rifts: () => town.mirror.rifts, riftSites: () => town.roster.riftSites, riftView: () => riftView.state(), radio: () => radioMenu(), startRift: o => town.cmd({ kind: 'startRift', ...o }), startCall: k => town.cmd({ kind: 'startCall', call: k }), fightOf: id => jobs.fightOf(id), useKey: () => hands.use(), skill: () => jobs.skill(), dodge: () => jobs.dodge(), facePos: () => ({ x: hands.you.x, z: hands.you.z, lv: hands.you.lv }), sweepRift() { frozen = true; const out = [], R = town.mirror.rifts[0]; for (const d of [12, 26, 60]) for (let k = 0; k < 4; k++) { god.goTo(R.x, R.z, d); god.yaw = k * Math.PI / 2; game.screen = 'god'; god.active = true; frame(performance.now(), { fixedDt: 0.26 }); frame(performance.now(), { fixedDt: 0.26 }); out.push({ d, k, draws: renderer.info.render.calls, tris: renderer.info.render.triangles, bodies: people.stats.bodies, standIns: people.stats.standIns, monsters: riftView.stats.monsters }); } god.yaw = 0; frozen = false; out.sort((a, b) => b.draws - a.draws || b.tris - a.tris); return { worstDraws: out[0], worstTris: out.slice().sort((a, b) => b.tris - a.tris)[0], views: out.length }; },
    /** M5. */
    fires: () => town.mirror.fires, burnt: () => town.mirror.burnt, fireDrawn: () => interiors.drawnBurn(), fireStats: () => fireView.stats, startFire: (building, opts = {}) => town.cmd({ kind: 'startFire', building, ...opts }), moment: () => momentCard.state(), momentShow: m => momentCard.show(m), momentJump: () => momentCard.jump(), startRoom: async (id, who) => { const p = plans(id), a = (await town.inspect(who))?.act, row = a && a.spot != null && a.spot !== -1 ? (a.spot >= 0 ? p.slots[a.spot] : p.floor[-2 - a.spot]) : null; return row?.room ?? (p.rooms.find(r => r.kind === 'living') ?? p.rooms[0]).id; }, routeMe: (x, z) => hands.routeTo({ x, z }), spraying: () => jobs.spraying, loadSaveBytes: async bytes => { saves.write(bytes, { household: 0, name: 'Old save', day: 0, minute: 0 }); await game.resume(); }, hydrants: () => world.hydrants, roadPath: (x0, z0, x1, z1) => { const nodeAt = (x, z) => roads.nodes.reduce((b, n) => ((n.x - x) ** 2 + (n.z - z) ** 2 < (b.x - x) ** 2 + (b.z - z) ** 2 ? n : b)); return roads.route(nodeAt(x0, z0).id, nodeAt(x1, z1).id).points; }, cmd: c => town.cmd(c), printSheet: () => town.cmd({ kind: 'printSheet' }), news: () => newsText(),
    /** Draw calls and triangles round a burning building, from every side, close and far, at the worst moment the sim can give. */
    sweepFire(id) {
      frozen = true;
      const out = [], b = buildingById.get(id);
      for (const d of [14, 26, 60]) for (let k = 0; k < 4; k++) {
        god.goTo(b.x, b.z, d); god.yaw = k * Math.PI / 2; game.screen = 'god'; god.active = true;
        frame(performance.now(), { fixedDt: 0.26 }); frame(performance.now(), { fixedDt: 0.26 });
        out.push({ d, k, draws: renderer.info.render.calls, tris: renderer.info.render.triangles, bodies: people.stats.bodies, standIns: people.stats.standIns, flames: fireView.stats.quads, props: fireView.stats.props, cars: trafficView.stats.drawn });
      }
      god.yaw = 0; frozen = false;
      out.sort((a, b2) => b2.draws - a.draws || b2.tris - a.tris);
      return { worstDraws: out[0], worstTris: out.slice().sort((a, b2) => b2.tris - a.tris)[0], views: out.length };
    },
    /** M3. */
    plan: id => { const p = plans(id); return p && { kind: p.kind, levels: p.levels, rooms: p.rooms.length, doors: p.doors.map(d => ({ id: d.id, lv: d.lv, kind: d.kind, a: d.a, x: d.x, z: d.z })), slots: p.slots.length, things: p.things.map(t => ({ id: t.id, kind: t.kind, lv: t.lv, x: t.x, z: t.z })) }; },
    buildings: () => world.buildings.map(b => ({ id: b.id, use: b.use, x: b.x, z: b.z, y: b.y, yaw: b.yaw, w: b.w, d: b.d, doorX: b.doorX, floors: b.floors, door: b.door, places: town.roster?.places.filter(p => p.building === b.id).map(p => p.id) })),
    mech: (id, t) => mech(id, t), floor: lv => { godLv = lv; }, goFloor: lv => hands.toFloor(lv), putIn: (x, z, lv) => { hands.you.x = x; hands.you.z = z; if (lv != null) hands.you.lv = lv; hands.snapCamera(); }, local: (id, x, z) => { const b = buildingById.get(id); return toWorld({ cx: b.x, cz: b.z, yaw: b.yaw }, x, z); },
    turnGod: y => { god.yaw = y; }, spots: () => [...people.spots.entries()].filter(([, q]) => !q.hidden && q.inside).map(([id, q]) => ({ id, x: +q.x.toFixed(2), z: +q.z.toFixed(2), lv: q.lv, anim: q.anim, lie: q.lie, walking: q.walking })), parkedCars: () => parkedRows.map(r => ({ car: r.car, x: r.x, z: r.z, inside: r.inside, mine: r.mine })),
    /** Every interior in town, floor by floor, from the worst of four sides: the budget test. */
    sweepIndoors(names = null) {
      frozen = true;
      const out = [], wasScreen = game.screen;
      for (const b of world.buildings) {
        const plan = plans(b.id); if (!plan || (names && !names.includes(b.use))) continue;
        for (let lv = 0; lv < plan.levels; lv++) for (let k = 0; k < 4; k++) {
          god.goTo(b.x, b.z, 26); god.yaw = k * Math.PI / 2; godBuilding = b.id; godLv = lv;
          game.screen = 'god'; god.active = true;
          frame(performance.now(), { fixedDt: 0.26 }); frame(performance.now(), { fixedDt: 0.26 });
          out.push({ b: b.id, use: b.use, lv, k, draws: renderer.info.render.calls, tris: renderer.info.render.triangles, roomTris: interiors.stats.tris, open: interiors.stats.open });
        }
      }
      god.yaw = 0; game.screen = wasScreen; frozen = false;
      out.sort((a, b) => b.draws - a.draws || b.tris - a.tris);
      return { worstDraws: out[0], worstTris: out.slice().sort((a, b) => b.tris - a.tris)[0], views: out.length };
    },
    saveText: () => town.saveText(), townData: () => townData, hash: () => town.hash, peopleInCars: () => cars.cars.map(c => ({ id: c.id, live: c.liveId ?? null, mine: !!c.mine, fade: +c.fade.toFixed(2), gone: c.gone })),
  };

  function handsHints() {
    if (!carOut || game.driving) { hhud.hint(hands.on && !game.driving && hands.useLabel() === 'GET IN' && !wantsTouch() ? 'E to get in' : ''); return; }
    if (!hands.recs.has(carOut.id)) { carOut = null; return; }
    const p = hands.pos, q = carOut.veh.rb.translation(), d = Math.hypot(q.x - p.x, q.z - p.z);      // where the car really is, not where it was asked to be
    hhud.hint(`Your car: ${Math.round(d)} m ${d < 5 ? '' : compass(q.x - p.x, q.z - p.z)}`);
  }
  const compass = (dx, dz) => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][((Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) % 8) + 8) % 8];
  canvas.addEventListener('click', e => game.handsTap(e.clientX, e.clientY));
  addEventListener('keydown', e => { if (e.code === 'KeyJ' && momentCard.open && !/INPUT|TEXTAREA/.test(e.target?.tagName || '')) momentCard.jump(); });
  addEventListener('keydown', e => { if (e.code === 'KeyR' && game.screen === 'hands' && !document.querySelector('.modal') && !/INPUT|TEXTAREA/.test(e.target?.tagName || '') && !e.repeat) { if (hands.on && jobs.fightOf(hands.me)) jobs.skill(); else if (town.roster.jobs[town.roster.people[hands.me]?.job]?.beat) radioMenu(); } if (/^Digit[1-4]$/.test(e.code) && game.screen === 'hands' && hands.on && jobs.fightOf(hands.me) && !document.querySelector('.modal')) { const id = [...hands.party.keys()][Number(e.code.slice(5)) - 1]; if (id !== undefined) hands.swapTo(id); } });
  addEventListener('keydown', e => { if (e.code === 'KeyC' && game.screen === 'hands' && !document.querySelector('.modal') && !/INPUT|TEXTAREA/.test(e.target?.tagName || '') && !e.repeat) spellMenu(); });
  addEventListener('keydown', e => { if (e.code === 'KeyP' && game.screen === 'hands' && !/INPUT|TEXTAREA/.test(e.target?.tagName || '') && !e.repeat) game.phoneOpen(); });
  document.getElementById('boot')?.remove();
  addEventListener('pagehide', () => { game.saveNow(); });
  addEventListener('keydown', e => {
    if (game.screen !== 'god' || document.querySelector('.modal') || /INPUT|TEXTAREA/.test(e.target?.tagName || '')) return;
    if (e.code === 'KeyT') game.takeOver(game.selected);
    else if (e.code === 'KeyP') game.phoneOpen();
    else if (e.code === 'Space') { e.preventDefault(); game.setSpeed(game.speed === 0 ? 1 : 0); }
    else if (e.code === 'Digit1') game.setSpeed(1); else if (e.code === 'Digit2') game.setSpeed(2); else if (e.code === 'Digit3') game.setSpeed(4);
    else if (e.code === 'Enter') game.tap(innerWidth / 2, innerHeight / 2);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) game.saveNow(); });
  if (params.has('play')) { const h = premades.households.find(x => x.id === params.get('play')) ?? premades.households[0]; await game.begin(h); } else if (params.has('room')) await game.joinRoom(params.get('room'));
  else if (asked) { await startTown({ seed: 1 }); game.start(); }
  if (asked) {
    autopilot();
    const banner = shell.soakBanner();
    soak = createSoak({ mins: asked.mins, perf, url: SOAK_URL, facts: () => ({ build: BUILD, tier: tierName, dpr: renderer.getPixelRatio(), size: [innerWidth, innerHeight], device: facts, ua: navigator.userAgent, gpu: gpuName(renderer) }),
      onTick: (k, left) => { banner.textContent = k >= 1 ? 'Speed test done. Numbers sent, thank you.' : `Speed test: leave this open. ${Math.ceil(left / 60)} min left`; } });
    window.gameEye.soak = soak;
  }
  fireView.warm(renderer, camera);
  // the rift pool: after the first frame is up, a slice at a time, then every program compiled once, so no rift ever stalls the game with a shader build
  riftView.build(() => new Promise(r => setTimeout(r, 0))).then(() => riftView.warm(renderer, camera)).catch(e => console.warn('[oddhaven] rift pool', e));
  requestAnimationFrame(loop);
}
function gpuName(r) { try { const gl = r.getContext(), d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : null; } catch { return null; } }
boot().catch(fail);
void saveSettings; void RACE_WORDS;
