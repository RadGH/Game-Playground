// Roverlands: boot, the 3D view, and the glue between the screens (js/client/ui) and one drive (js/game/session.js).
//
//   index.html -> main.js: renderer + scene, Rapier, the title fly-over, then the UI decides when a game starts.
//   prepare(seed, progress, map)  builds the world for a room's seed + map ('county' for County rooms, 'classic' for
//                  Flag Run + Sandbox — js/net/places.js mapFor); the same seed + map builds the same world everywhere
//   onGame(net)    starts a session on that world; onLeave() ends it.
// window.roverlands / window.gameEye.state() for tests and Claude's game-eye.
import * as THREE from 'three';
import RAPIER from '../../../../vendor/rapier/rapier.mjs';
import { generateWorldAsync } from '../world/world-async.js';
import { mapFor, mapOfPlace } from '../net/places.js';
import { createOrbitScreen } from './orbit-screen.js';
import { travelMsg } from '../game/space-play.js';
import { buildModel } from './models/index.js';
import { createSimpleView } from './simple-view.js';
import { createUI } from './ui/index.js';
import { createSession } from '../game/session.js';
import { createInput } from '../game/input.js';
import { createSounds } from './sounds.js';
import { loadLookData } from '../../../knockabout/js/client/look.js';
import { createThumbs } from './thumbs.js';
import { addShopSigns } from './shop-signs.js';
import { findSummonSpot, blockersNear } from '../game/summon-spot.js';
import { jobTable } from '../game/jobs/registry.js';
import { moonJobSites, moonSurveyGrid } from '../game/jobs/moon.js';
import { surveyGrid } from '../game/survey.js';

const Q = new URLSearchParams(location.search);
const canvas = document.getElementById('view');
const cross = document.getElementById('cross');
const bootEl = document.getElementById('boot');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(1.75, devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2200);
let scene = new THREE.Scene();

const defs = (await (await fetch('data/vehicles.json')).json()).vehicles;
const shop = await fetch('data/shop.json').then(r => r.json()).catch(() => ({}));     // solo: the room prices from it
const jobs = jobTable(await fetch('data/jobs.json').then(r => r.json()).catch(() => ({})));   // M6: farming's levels (which field opens when)
const rapierReady = RAPIER.init();
const lookReady = loadLookData();
let world = null, view = null, worldSeed = null, worldMap = null, session = null, composer = null, signs = null;
const sounds = await createSounds({});

let ui = null, roomSites = null;     // roomSites: the sites object a solo room was handed (M12 adds the Moon's to it)
async function buildWorld(seed, progress = () => {}, map = 'classic') {
  if (worldSeed === seed && worldMap === map && world) return world;
  progress(0.05);
  await new Promise(r => setTimeout(r, 0));
  world = await generateWorldAsync({ seed, map }, f => progress(0.05 + f * 0.5));   // in a worker (falls back to the page)
  worldSeed = seed; worldMap = map;
  // M10: the survey grid the kit rules judge spots on (the room in this page reads it from the sites; online the server builds its own)
  if (map === 'county' && world.sites && !world.sites.surveyGrid) world.sites.surveyGrid = surveyGrid(world);
  progress(0.55);
  scene = new THREE.Scene();
  view = null;
  const quality = ui?.settings().quality || 'medium';
  if (Q.get('view') !== 'simple' && quality !== 'simple') {
    try {
      const mod = await import('./world-view/index.js');
      view = await mod.createWorldView({ THREE, renderer, scene, camera, world, quality, progress: p => progress(0.55 + p * 0.4) });
    } catch (e) { console.warn('[roverlands] full world view not available, using the simple one:', e?.message || e); scene = new THREE.Scene(); view = null; }
  }
  view ||= createSimpleView({ THREE, renderer, scene, camera, world });
  signs?.dispose(); signs = addShopSigns({ THREE, scene, world });       // County: a name over every shop door (M4)
  composer = view.render ? view : null;
  // M12: solo — the room in this page (loopback) was handed the County's sites; the Moon Work referee reads the Moon's
  // job sites from them, so the first time this seed's Moon is built they go in (online, the server builds them)
  // (and the Moon's survey grid goes on this world too: M10's survey glue then works on the Moon, Greywatch as the office)
  if (map === 'moon') {
    const g = world.sites.surveyGrid ||= moonSurveyGrid(world);
    if (roomSites?.seed === seed && !roomSites.sites.moon) roomSites.sites.moon = { ...moonJobSites(world, { grid: false }), surveyGrid: g };
  }
  ui?.setWorld({ size: world.size, sites: world.sites, mapImage: view.mapImage?.(768), labels: world.labels });
  progress(1);
  return world;
}

ui = createUI({
  canvas, vehicles: defs, defaultSeed: 7,
  prepare: async (seed, progress, map) => { await rapierReady; await lookReady; await buildWorld(seed, progress, map); roomSites = { sites: world.sites, seed }; return { sites: world.sites, vehicles: defs, shop }; },
  onGame: async (net, info) => {
    await rapierReady; await lookReady;
    if (worldSeed !== net.room.seed || worldMap !== mapFor(net.room.mode)) await buildWorld(net.room.seed, undefined, mapFor(net.room.mode));
    session?.dispose();
    sounds.unlock();
    gameInfo = info; place = null;
    session = await startSession(net, null);
    // M11: the room moves you between places (orbit, the station, the Moon, home by pod) on this same connection
    if (!hooked.has(net)) { hooked.add(net); net.on('orbit', () => showOrbit(net)); net.on('go', m => travel(net, m)); }
    statsAcc = { m: 0, at: performance.now(), last: null };
    input.inGame = true;
    ui.setFlagSites?.(world.sites.flags.map(f => ({ id: f.id, name: f.name })));
  },
  onLeave: () => { orbitScr?.dispose(); orbitScr = null; travelling = false; fadeEl.classList.remove('on'); session?.dispose(); session = null; input.inGame = false; sounds.stopAll(); input.unlock(); },
  onFollow: () => {},
  getDebug: () => ({ ...(session?.debug() || {}), fps: Math.round(fps), draws: renderer.info.render.calls, tris: renderer.info.render.triangles, quality: ui?.settings().quality, view: view?.kind || (view?.render ? 'full' : 'simple'), post: view?.post || null, gl: glInfo() }),
  screenshot: () => { render(); return canvas.toDataURL('image/jpeg', 0.72); },
});
/** One session on the world that is built now (arrive: M11's change of place — { place, at, pod }). */
function startSession(net, arrive) {
  return createSession({ THREE, RAPIER, renderer, scene, camera, world, view, net, defs, input, settings: () => ui.settings(), spectate: !!gameInfo?.spectate, sounds, jobs, arrive,
    onLeftVehicle: (kind, secs) => ui.vehicleLeft(kind, secs), onToast: t => ui.hud.toast(t), onMap: () => ui.openMap(), onMenu: () => ui.openMenu(),
    // a shop door in reach: "E — Open the Dealer" (M4); M11: the Skyreach sales desk opens the Dealer too
    openDealer: () => ui.openShop({ kind: 'dealer', name: 'Skyreach Sales', city: null }),
    nearSpot: feet => { const sh = ui.nearShop(feet); return sh ? { hint: `Open the ${SHOP_WORD[sh.kind] || sh.name}`, use: () => ui.openShop(sh) } : null; } });
}
// ----------------------------------------------------------------------------------------------- places (M11)
// `orbit` from the room: the crew is in orbit — fade to black, then the orbit screen (the planet below, three choices).
// `go` from the room: another place. The sky (M9) and the trip home by pod share the county's world, so nothing is
// rebuilt; the Moon and the station are other worlds: the session ends, the world is built, a new session starts on
// the same connection with where the room put you.
let gameInfo = null, place = null, orbitScr = null, travelling = false;
const hooked = new WeakSet();
const fadeEl = Object.assign(document.createElement('div'), { className: 'rl-orbit-fade' }); document.body.append(fadeEl);
const orbitDef = () => defs.find(d => d.id === 'rocket') || null;
function showOrbit(net) {
  if (orbitScr || ui.net !== net) return;
  fadeEl.classList.add('on');
  setTimeout(() => {
    if (ui.net !== net || orbitScr) return;
    orbitScr = createOrbitScreen({ THREE, renderer, buildModel, def: orbitDef(), onPick: choice => net.send(travelMsg(choice, Math.abs(net.you | 0) % 4)) });
    fadeEl.classList.remove('on');
    ui.hud.toast('In orbit! Pick where to go');
  }, 900);
}
async function travel(net, m) {
  if (ui.net !== net) return;
  const map = mapOfPlace(m.place);
  orbitScr?.dispose(); orbitScr = null;
  place = m.place;
  if (map === worldMap) { fadeEl.classList.remove('on'); return; }       // the sky / home by pod: the same world
  travelling = true; fadeEl.classList.add('on');
  session?.dispose(); session = null; sounds.stopAll();
  try {
    await buildWorld(net.room.seed, undefined, map);
    if (ui.net !== net) return;
    session = await startSession(net, { place: m.place, at: m.at || null, pod: m.pod ?? null });
  } catch (e) { console.error('[roverlands] travel', e); ui.hud.toast('Could not get there: ' + (e?.message || e)); }
  finally { travelling = false; setTimeout(() => fadeEl.classList.remove('on'), 250); }
}
// ----------------------------------------------------------------------------------------------- the phone's helpers (M4)
const SHOP_WORD = { dealer: 'Dealer', outfitter: 'Outfitter', supply: 'Supply Store', market: 'Produce Market' };
const thumbs = createThumbs({ THREE, renderer, defs });
/** Where I am now: my vehicle's middle when seated, else my feet. */
function hereNow() {
  const id = session?.mySeat?.[0], E = id != null ? session.ents.get(id) : null;
  if (E?.veh) { const t = E.veh.rb.translation(); return [t.x, t.y, t.z]; }
  return session?.walker?.feet || null;
}
ui.setGame({
  thumb: id => thumbs.get(id),
  spawnKit: id => (session?.survey ? session.survey.spawn(id) : { why: 'Survey kits are set up in Wayfare County.' }),      // M10: the phone's Items app
  canSummon() {
    if (!session) return 'Your phone works once you are in a game.';
    if (world?.map === 'station') return 'There is nothing to call up here — float, or head home from the docking hatch.';
    const hd = session.hud();
    if (hd.kmh != null && hd.kmh > 12) return 'Slow down first — you can call a vehicle once you have stopped.';
    return null;
  },
  summonSpot(kind) {
    const at = hereNow(); if (!at || !world) return null;
    // M11: the rocket stands only on the Skyreach launch pad, and you call it from the launch site
    if (kind === 'rocket') {
      const L = world.sites?.launch;
      if (!L) return { why: 'The rocket can only stand on the Skyreach launch pad.' };
      if (Math.hypot(at[0] - L.x, at[2] - L.z) > 190) return { why: 'Go to the Skyreach launch site to call the rocket — it stands only on the pad.' };
      if ([...session.ents.values()].some(X => X.veh && Math.hypot(X.veh.rb.translation().x - L.pad.x, X.veh.rb.translation().z - L.pad.z) < 4)) return { why: 'Something is standing on the launch pad — move it off first.' };
      return { p: [L.pad.x, world.heightAt(L.pad.x, L.pad.z) + session.restLift(kind), L.pad.z], yaw: 0 };
    }
    const def = session.defOf(kind);
    const halfLen = def?.wheels?.length ? Math.max(...def.wheels.map(w => Math.abs(w.p[2]) + (w.r || 0.4))) + 0.4 : 2.6;
    const blockers = blockersNear(world.objects, [at[0], at[2]], 60);
    for (const X of session.ents.values()) { const t = X.veh?.rb?.translation(); if (t) blockers.push({ x: t.x, z: t.z, r: X.isProp ? 0.8 : 2.8 }); }
    blockers.push({ x: at[0], z: at[2], r: 1.2 });
    return findSummonSpot({ world, from: [at[0], at[2]], lift: session.restLift(kind), blockers, halfLen, yaw: session.cam.yaw });
  },
});
// driven metres for the achievements: summed while I drive, sent every 10 s (the room caps it by time)
let statsAcc = { m: 0, at: 0, last: null };
function trackStats(hd) {
  const net = ui.net; if (!net || !session) return;
  const at = hd.role === 'driver' ? hereNow() : null;
  if (at && statsAcc.last) { const d = Math.hypot(at[0] - statsAcc.last[0], at[2] - statsAcc.last[2]); if (d < 15) statsAcc.m += d; }
  statsAcc.last = at;
  const t = performance.now();
  if (t - statsAcc.at > 10_000) { if (statsAcc.m >= 1) net.send({ t: 'stats', metres: Math.round(statsAcc.m * 10) / 10 }); statsAcc.m = 0; statsAcc.at = t; }
}
function glInfo() { try { const gl = renderer.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info'); return { v: gl.getParameter(gl.VERSION), gpu: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : null, lost: gl.isContextLost(), half: renderer.extensions.has('EXT_color_buffer_half_float'), float: renderer.extensions.has('EXT_color_buffer_float') }; } catch { return null; } }
const input = createInput(canvas, { touch: () => ui.touchState(), settings: () => ui.settings() });
ui.onSettings?.(s => { sounds.setVolume(s.volume ?? 0.8); view?.setQuality?.(s.quality); });

// a world behind the title straight away (the default seed; the classic world, whose flag sites the Host dialog lists)
rapierReady.then(() => buildWorld(7)).then(() => { bootEl.remove(); ui.setFlagSites?.(world.sites.flags.map(f => ({ id: f.id, name: f.name }))); }).catch(e => { bootEl.textContent = 'Could not build the world: ' + (e?.message || e); console.error(e); });

// ----------------------------------------------------------------------------------------------------- frame loop
let last = performance.now(), fps = 60, flyT = 0;
function render(dt = 1 / 60) { if (composer) composer.render(dt); else renderer.render(scene, camera); }   // view.render takes the time step (it once got the scene: NaN in the grade pass)
function frame() {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  const w = innerWidth, h = innerHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 72 : 62; camera.updateProjectionMatrix(); view?.resize?.(w, h);
  }
  if (orbitScr && ui.screen === 'game') {
    input.read(dt);                                // drain: no driving while the orbit screen is up
    orbitScr.render(dt);
    requestAnimationFrame(frame);
    return;
  }
  if (travelling) { input.read(dt); renderer.render(blackScene, camera); requestAnimationFrame(frame); return; }
  if (session && ui.screen === 'game') {
    if (ui.blocking()) input.read(dt);           // drain: no driving while a menu is up
    else session.frame(dt);
    const hd = session.hud();
    ui.hud.speed(hd.kmh);
    // the harvester in the old world counts its grain; in the County the farm line says the field, the load, the tank (M6)
    if (hd.grain != null) ui.hud.flagText?.(`Grain cut: ${Math.round(hd.grain * 4)} m²`); else if (hd.farm) ui.hud.flagText?.(hd.farm); else if (frame.grainShown) ui.hud.flagText?.(null);
    frame.grainShown = hd.grain != null || !!hd.farm;
    // M11: up on the station / the Moon the place box says so
    { const pl = PLACE_LABEL[world?.map]; if (pl && !hd.farm) { ui.hud.flagText?.(pl); frame.placeShown = true; } else if (frame.placeShown) { frame.placeShown = false; if (!frame.grainShown) ui.hud.flagText?.(null); } }     // (M12: Moon Work's line wins)
    // a hint that names its own key ("F — Open the back doors") gets that key for this device instead of E
    const ownKey = hd.hint && /^[FT] — /.test(hd.hint) && hd.hint[0];
    const KEYS = ownKey === 'T' ? HITCHNAME : SWAPNAME;
    // a hint that starts with its own control ("Fire: …", "Shift — …") or is just news ("Tank empty — …", "Selling…")
    // is not an E action: say the fire button for this device, or nothing (M6 farming hints)
    const own = hd.hint && /^(Fire|Shift|Space|Tank|Field|Filling|Selling|Stop|Too|Loading|Ram|Winching|Bring|Handing|Unloading|Slow|Walk|Picking)\b/.test(hd.hint);
    const text = !hd.hint ? null : ownKey ? `${KEYS[hd.device] || ownKey} — ${hd.hint.slice(4)}` : own ? hd.hint.replace(/^Fire:/, `${FIRENAME[hd.device] || 'Fire'} —`) : `${KEYNAME[hd.device] || 'E'} — ${hd.hint}`;
    ui.hud.seatHint(text);
    ui.touch.mode(hd.role === 'driver' ? (hd.gun ? 'drivegun' : 'drive') : hd.role === 'gunner' ? 'gunner' : hd.role ? 'passenger' : 'foot');   // M8: a driver with a gun (tank, hover tank, Second gun mount) gets FIRE
    ui.touch.hitchable?.(hd.hitch);
    ui.touch.flippable?.(hd.tipped);
    const meM = hd.markers.find(m => m.kind === 'me');
    ui.markers({
      you: meM ? { x: meM.x, z: meM.z, dir: [Math.sin(session.cam.yaw), Math.cos(session.cam.yaw)] } : null,
      camDir: [Math.sin(session.cam.yaw), Math.cos(session.cam.yaw)],
      players: hd.markers.filter(m => m.kind === 'player').map(m => ({ pid: m.pid, x: m.x, z: m.z, label: m.label })),
      vehicles: hd.markers.filter(m => m.kind === 'vehicle').map(m => ({ id: m.id, kind: m.vehicle, x: m.x, z: m.z, busy: m.busy })),
      spots: [...(hd.spots || []), ...(hd.skySpots || [])],   // + M9: the Jump Point (J) and the landing rings (T)             // M6: where produce sells, the farm's water point
    });
    cross.hidden = hd.role !== 'gunner' && !hd.gun;
    trackStats(hd);
    signs?.update(camera);
  } else if (world) {
    // the title fly-over: a slow circle over the home base and out across the valley
    flyT += dt * 0.03;
    const h0 = world.sites.home;
    const cx = h0.x * 0.6 + Math.cos(flyT) * 260, cz = h0.z * 0.6 + Math.sin(flyT) * 260;
    camera.position.set(cx, world.heightAt(cx, cz) + 70, cz);
    camera.lookAt(h0.x * 0.3, world.heightAt(h0.x * 0.3, h0.z * 0.3) + 10, h0.z * 0.3);
    view?.update?.(dt, camera);
    cross.hidden = true;
  }
  if (world) render(dt);
  requestAnimationFrame(frame);
}
const FIRENAME = { keys: 'Click', pad: 'RB', touch: 'FIRE' };
const PLACE_LABEL = { station: 'Lantern Station — zero gravity', moon: 'The Moon — Greywatch' };
const blackScene = new THREE.Scene(); blackScene.background = new THREE.Color('#000');
const KEYNAME = { keys: 'E', pad: 'X', touch: 'ENTER' }, SWAPNAME = { keys: 'F', pad: 'Y', touch: 'SEAT' }, HITCHNAME = { keys: 'T', pad: 'D-pad left', touch: 'HITCH' };
frame();

window.roverlands = { get session() { return session; }, get world() { return world; }, ui, renderer, scene: () => scene, camera,
  get place() { return place; }, get orbit() { return orbitScr; }, get travelling() { return travelling; } };
window.gameEye = { state: () => ({ screen: ui.screen, ui: ui.state?.(), game: session?.debug() || null, hud: session?.hud() || null }) };
