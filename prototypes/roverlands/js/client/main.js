// Roverlands: boot, the 3D view, and the glue between the screens (js/client/ui) and one drive (js/game/session.js).
//
//   index.html -> main.js: renderer + scene, Rapier, the title fly-over, then the UI decides when a game starts.
//   prepare(seed)  builds the world for a room's seed (the same seed builds the same world on every machine)
//   onGame(net)    starts a session on that world; onLeave() ends it.
// window.roverlands / window.gameEye.state() for tests and Claude's game-eye.
import * as THREE from 'three';
import RAPIER from '../../../../vendor/rapier/rapier.mjs';
import { generateWorld } from '../world/worldgen.js';
import { createSimpleView } from './simple-view.js';
import { createUI } from './ui/index.js';
import { createSession } from '../game/session.js';
import { createInput } from '../game/input.js';
import { createSounds } from './sounds.js';
import { loadLookData } from '../../../knockabout/js/client/look.js';

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
const rapierReady = RAPIER.init();
const lookReady = loadLookData();
let world = null, view = null, worldSeed = null, session = null, composer = null;
const sounds = await createSounds({});

let ui = null;
async function buildWorld(seed, progress = () => {}) {
  if (worldSeed === seed && world) return world;
  progress(0.05);
  await new Promise(r => setTimeout(r, 0));
  world = generateWorld({ seed, vehicles: defs.map(d => d.id) });
  worldSeed = seed;
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
  composer = view.render ? view : null;
  ui?.setWorld({ size: world.size, sites: world.sites, mapImage: view.mapImage?.(768), labels: world.labels });
  progress(1);
  return world;
}

ui = createUI({
  canvas, vehicles: defs, defaultSeed: 7,
  prepare: async (seed, progress) => { await rapierReady; await lookReady; await buildWorld(seed, progress); return { sites: world.sites, vehicles: defs }; },
  onGame: async (net, info) => {
    await rapierReady; await lookReady;
    if (worldSeed !== net.room.seed) await buildWorld(net.room.seed);
    session?.dispose();
    sounds.unlock();
    session = await createSession({ THREE, RAPIER, renderer, scene, camera, world, view, net, defs, input, settings: () => ui.settings(), spectate: !!info?.spectate, sounds,
      onLeftVehicle: (kind, secs) => ui.vehicleLeft(kind, secs), onToast: t => ui.hud.toast(t), onMap: () => ui.openMap(), onMenu: () => ui.openMenu() });
    input.inGame = true;
    ui.setFlagSites?.(world.sites.flags.map(f => ({ id: f.id, name: f.name })));
  },
  onLeave: () => { session?.dispose(); session = null; input.inGame = false; sounds.stopAll(); input.unlock(); },
  onFollow: () => {},
  getDebug: () => ({ ...(session?.debug() || {}), fps: Math.round(fps), draws: renderer.info.render.calls, tris: renderer.info.render.triangles, quality: ui?.settings().quality, view: view?.kind || (view?.render ? 'full' : 'simple') }),
  screenshot: () => { render(); return canvas.toDataURL('image/jpeg', 0.72); },
});
const input = createInput(canvas, { touch: () => ui.touchState(), settings: () => ui.settings() });
ui.onSettings?.(s => { sounds.setVolume(s.volume ?? 0.8); view?.setQuality?.(s.quality); });

// a world behind the title straight away (the default seed — most games are played on it)
rapierReady.then(() => buildWorld(7)).then(() => { bootEl.remove(); ui.setFlagSites?.(world.sites.flags.map(f => ({ id: f.id, name: f.name }))); }).catch(e => { bootEl.textContent = 'Could not build the world: ' + (e?.message || e); console.error(e); });

// ----------------------------------------------------------------------------------------------------- frame loop
let last = performance.now(), fps = 60, flyT = 0;
function render() { if (composer) composer.render(scene, camera); else renderer.render(scene, camera); }
function frame() {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  const w = innerWidth, h = innerHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w < h ? 72 : 62; camera.updateProjectionMatrix(); view?.resize?.(w, h);
  }
  if (session && ui.screen === 'game') {
    if (ui.blocking()) input.read(dt);           // drain: no driving while a menu is up
    else session.frame(dt);
    const hd = session.hud();
    ui.hud.speed(hd.kmh);
    if (hd.grain != null) ui.hud.flagText?.(`Grain cut: ${Math.round(hd.grain * 4)} m²`); else if (frame.grainShown) ui.hud.flagText?.(null);
    frame.grainShown = hd.grain != null;
    // a hint that names its own key ("F — Open the back doors") gets that key for this device instead of E
    const ownKey = hd.hint && /^F — /.test(hd.hint);
    ui.hud.seatHint(hd.hint ? (ownKey ? `${SWAPNAME[hd.device] || 'F'} — ${hd.hint.slice(4)}` : `${KEYNAME[hd.device] || 'E'} — ${hd.hint}`) : null);
    ui.touch.mode(hd.role === 'driver' ? 'drive' : hd.role === 'gunner' ? 'gunner' : hd.role ? 'passenger' : 'foot');
    const meM = hd.markers.find(m => m.kind === 'me');
    ui.markers({
      you: meM ? { x: meM.x, z: meM.z, dir: [Math.sin(session.cam.yaw), Math.cos(session.cam.yaw)] } : null,
      camDir: [Math.sin(session.cam.yaw), Math.cos(session.cam.yaw)],
      players: hd.markers.filter(m => m.kind === 'player').map(m => ({ pid: m.pid, x: m.x, z: m.z, label: m.label })),
      vehicles: hd.markers.filter(m => m.kind === 'vehicle').map(m => ({ id: m.id, kind: m.vehicle, x: m.x, z: m.z, busy: m.busy })),
    });
    cross.hidden = hd.role !== 'gunner';
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
  if (world) render();
  requestAnimationFrame(frame);
}
const KEYNAME = { keys: 'E', pad: 'X', touch: 'ENTER' }, SWAPNAME = { keys: 'F', pad: 'Y', touch: 'SEAT' };
frame();

window.roverlands = { get session() { return session; }, get world() { return world; }, ui, renderer, scene: () => scene, camera };
window.gameEye = { state: () => ({ screen: ui.screen, ui: ui.state?.(), game: session?.debug() || null, hud: session?.hud() || null }) };
