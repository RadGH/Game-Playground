// Test drive: the real world + physics + session, solo, with the simple view (or the full one with ?view=full).
// A dev page for tuning; the game itself is index.html. ?seed=7&mode=flag|sandbox&v=dirtbike (start seated)
import * as THREE from 'three';
import RAPIER from '../../../../vendor/rapier/rapier.mjs';
import { generateWorld } from '../world/worldgen.js';
import { createSimpleView } from './simple-view.js';
import { connect } from '../net/client.js';
import { createSession, fmtTime } from '../game/session.js';
import { createInput } from '../game/input.js';
import { randomLook, loadLookData } from '../../../knockabout/js/client/look.js';

const Q = new URLSearchParams(location.search);
const dbg = document.getElementById('dbg'), hintEl = document.getElementById('hint');
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1600);
await RAPIER.init();
let seed = +(Q.get('seed') || 7);
const defs = (await (await fetch('data/vehicles.json')).json()).vehicles;
await loadLookData();
const look = randomLook();
const online = Q.get('online') === '1';
const code = Q.get('code');
// solo: the world first (the in-page referee needs its sites); online: the room first (the world comes from its seed)
let world = online ? null : generateWorld({ seed });
const net = await connect({ online, ...(code ? { code } : { create: { mode: Q.get('mode') || 'flag', seed, start: true } }), name: Q.get('name') || 'Tester', look, sites: world?.sites, vehicles: defs });
if (online) { seed = net.room.seed; world = generateWorld({ seed }); }
let view;
if (Q.get('view') === 'full') { try { view = await (await import('./world-view/index.js')).createWorldView({ THREE, renderer, scene, camera, world, quality: Q.get('q') || 'medium' }); } catch (e) { console.warn('full view failed', e); } }
view ||= createSimpleView({ THREE, renderer, scene, camera, world });
const input = createInput(canvas);
input.inGame = true;
const session = await createSession({ THREE, RAPIER, renderer, scene, camera, world, view, net, defs, input });
window.rover = { ready: true, code: net.code, session, world, net, debug: () => session.debug(), hud: () => session.hud() };
let lastT = performance.now();
function loop() {
  const tNow = performance.now(), dt = (tNow - lastT) / 1000; lastT = tNow;
  const w = innerWidth, h = innerHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  session.frame(dt);
  renderer.render(scene, camera);
  const hd = session.hud();
  hintEl.textContent = hd.hint ? 'E — ' + hd.hint : (hd.toasts.at(-1) || '');
  dbg.textContent = `${hd.vehicle ? hd.vehicle + ' ' + hd.kmh + ' km/h' : 'on foot'}  ${hd.biome || ''}\nflag: ${hd.flag?.state || '-'} ${hd.runClock != null ? fmtTime(hd.runClock) : ''}\n${renderer.info.render.calls} draws  ${Math.round(1 / Math.max(dt, 1e-3))} fps`;
  requestAnimationFrame(loop);
}
loop();
