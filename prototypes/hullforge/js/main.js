// Hullforge — a 3D space game where you build your ship from blocks. Main loop and the glue between the
// simulation (js/sim), the drawing (js/render) and the screens (js/ui).
//
// Modes: 'title' → 'fly' ⇄ 'docked' (station screens, Shipyard builder) → 'dead' → docked again.
// The sim steps at a fixed 60 Hz; bodies are drawn between the last two steps (`alpha`) so motion is smooth at
// any refresh rate, and the camera follows the DRAWN ship.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { createWorld, step, addBody, DT, SAFE_RADIUS, hostile, inSafeZone } from './sim/world.js';
import { think } from './sim/ai.js';
import { generateGalaxy, populate, spawnGroup, sunOf } from './sim/galaxy.js';
import { createBody, forward, upOf, refresh } from './sim/body.js';
import { computeStats } from './sim/stats.js';
import { rayWorld } from './sim/hit.js';
import { liveGrid, storeDamage, save, load, lastSlot, cargoUsed, designGrid } from './sim/state.js';
import { checkGoals, currentGoal } from './sim/goals.js';
import { itemName, rarityOf } from './sim/items.js';
import { ORES, RARITY } from './data/blocks.js';
import { vadd, vsub, vscale, vnorm, vdot, vcross, vlen, vdist, qrot, qslerp, qaxis, qmul, qnorm, clamp, hash, vlerp } from './core/math.js';

import { hullMaterial } from './render/ship-mesh.js';
import { makeEnvironment } from './render/env.js';
import { buildSky } from './render/sky.js';
import { createViews } from './render/views.js';
import { createFx } from './render/fx.js';
import { createInput } from './core/input.js';
import { initAudio, resumeAudio, play, lib, setVolume, setMuted, TURRET_VOICE, loopLevel, boostSound } from './core/audio.js';
import { createHud } from './ui/hud.js';
import { $, el, toast, banner, credits as cr } from './ui/dom.js';
import { installTooltips } from '../../../shared/tooltip.js';

export const BUILD = '2026-11-14a';
const view = $('#view');

// ------------------------------------------------------------------ settings (per device)
const PREFS_KEY = 'hullforge.prefs';
const DEFAULTS = { volume: 0.7, muted: false, sens: 1, invertY: false, quality: 'high', shake: 'full', fov: 70 };
function loadPrefs() { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return { ...DEFAULTS }; } }
export const app = {
  mode: 'title', G: null, w: null, P: null, gal: null, prefs: loadPrefs(), shake: 0, lastDt: 1 / 60,
  savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(app.prefs)); } catch { /* blocked */ } applyPrefs(); },
};
window.app = app;
// Plug-in points so each system lives in its own module (round 2): a module pushes functions here.
//   event(e)        every sim event after the built-in handling
//   frame(dt, now)  every flying frame after the sim stepped (not while paused)
//   enter(sys, w)   a system was entered (world populated, player placed)
//   dock() / launch()
//   action(id)      a pressed input action the main loop does not own (harpoon, scan, drones…)
// Station services: app.services = [{ id, title, sub(app), open(app, redraw), when?(app) }] (shown in order after the built-ins).
// Menu items: app.menuItems = [{ label, run(app), when?(app) }].
app.hooks = { event: [], frame: [], enter: [], dock: [], launch: [], action: [] };
app.services = []; app.menuItems = [];
const runHooks = (k, ...a) => { for (const f of app.hooks[k]) { try { f(...a); } catch (err) { console.error(err); } } };
app.runHooks = runHooks;

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(app.prefs.fov, innerWidth / innerHeight, 0.3, 40000);
scene.add(camera);
scene.environment = makeEnvironment(renderer); scene.environmentIntensity = 0.75;
const hemi = new THREE.HemisphereLight(0x9fb8ff, 0x2a2420, 0.7); scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xfff1dc, 3.2); scene.add(sunLight); scene.add(sunLight.target);
const fillLight = new THREE.DirectionalLight(0x6f8cff, 0.8); scene.add(fillLight);
const camLight = new THREE.PointLight(0xbfd4ff, 0.0, 120, 1.6); camera.add(camLight);   // soft light from the camera so the hull's shaded side reads
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.55, 0.82);
composer.addPass(bloom); composer.addPass(new OutputPass());
function resize() {
  const dpr = app.prefs.quality === 'high' ? Math.min(2, devicePixelRatio || 1) : 1;
  renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false);
  composer.setPixelRatio(dpr); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  app.hud?.resize();
}
addEventListener('resize', resize);
function applyPrefs() {
  setVolume(app.prefs.volume); setMuted(app.prefs.muted);
  bloom.enabled = app.prefs.quality !== 'low';
  app.fx?.setQuality(app.prefs.quality === 'low' ? 0.5 : 1);
  camera.fov = app.prefs.fov; camera.updateProjectionMatrix();
  resize();
}
hullMaterial();   // build the shared hull material + atlas once at load
const views = createViews(scene);
const fx = createFx(scene); app.fx = fx;
const input = createInput(view);
app.views = views; app.input = input; app.sunLight = sunLight; app.fillLight = fillLight; app.scene = scene; app.camera = camera; app.renderer = renderer;
installTooltips();

// ------------------------------------------------------------------ the camera rig (mouse aim)
// aimDir: where you want to go/shoot (world). The ship turns its nose toward it; the camera sits behind it.
const rig = { aim: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, dist: 1, pos: null, look: null };
function resetRig(P) { rig.aim = forward(P); rig.up = upOf(P); rig.dist = 1; rig.pos = null; }
function turnAim(dx, dy) {
  const s = 0.0022 * app.prefs.sens; const right = vnorm(vcross(rig.aim, rig.up));
  let a = rotate(rig.aim, rig.up, -dx * s);
  a = rotate(a, right, (app.prefs.invertY ? 1 : -1) * dy * s);
  // never past straight up/down relative to the camera's up (no flipping)
  if (Math.abs(vdot(a, rig.up)) < 0.985) rig.aim = vnorm(a);
}
function rotate(v, axis, ang) { const q = qaxis(vnorm(axis), ang); return qrot(q, v); }

// ------------------------------------------------------------------ smooth drawing
function snapPrev(w) { for (const b of w.bodies) { b.prevPos = { ...b.pos }; b.prevQuat = { ...b.quat }; } }
let alpha = 1;
const pose = b => (b.prevPos && alpha < 1 ? { pos: vlerp(b.prevPos, b.pos, alpha), quat: qslerp(b.prevQuat, b.quat, alpha) } : { pos: b.pos, quat: b.quat });
app.pose = pose;

// ------------------------------------------------------------------ systems
let sky = null;
export function enterSystem(sysId, { docked = false } = {}) {
  const G = app.G; const sys = app.gal.systems[sysId];
  G.system = sysId; if (!G.visited.includes(sysId)) G.visited.push(sysId);
  G.stats.maxDanger = Math.max(G.stats.maxDanger || 1, sys.danger);
  G.stock[sysId] = { visits: (G.stock[sysId]?.visits || 0) + 1, sold: [] };
  views.clear(); fx.clear();
  sky?.dispose(); sky = buildSky(scene, sys, sunOf(sys)); app.sky = sky;   // world: outposts sit toward the planet
  sunLight.color.set(sunOf(sys).light); sunLight.position.copy(sky.sunDir).multiplyScalar(100);
  fillLight.position.copy(sky.sunDir).multiplyScalar(-100).add(new THREE.Vector3(0, -30, 0));
  const w = createWorld(hash(G.galaxySeed, sysId, G.stock[sysId].visits)); w.brain = think;
  w.cargoRoom = () => app.P ? app.P.stats.cargo - cargoUsed(G) : 0;
  populate(w, sys);
  app.w = w;
  makePlayer(docked);
  runHooks('enter', sys, w);
  if (docked) dock(); else { app.mode = 'fly'; banner(sys.name, `Danger ${sys.danger} · ${sys.faction === 'swarm' ? 'Hive space' : 'Pirate space'}`); }
}
function makePlayer(docked) {
  const G = app.G, w = app.w;
  const P = createBody(liveGrid(G), { kind: 'ship', team: 'player', name: G.shipName });
  // out at the docking arm's mouth, nose pointing away from the station
  const st = w.station;
  const mouth = vadd(st.pos, qrot(st.quat, { x: 46, y: 0, z: 0 }));
  P.pos = docked ? mouth : vadd(st.pos, { x: 1400, y: 60, z: 300 });
  const out = vnorm(vsub(P.pos, st.pos)); P.quat = qnorm(lookQuat(out));
  P.grace = w.t + 6;
  P.baseHp = computeStats(designGrid(G)).maxHp;     // breaking point is measured against the full design
  addBody(w, P); w.player = P; app.P = P;
  resetRig(P);
}
function lookQuat(dir) {
  // the rotation that turns +z to dir, keeping +y as up as far as it can
  const f = vnorm(dir); const r = vnorm(vcross({ x: 0, y: 1, z: 0 }, f)); const u = vcross(f, r);
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(r.x, r.y, r.z), new THREE.Vector3(u.x, u.y, u.z), new THREE.Vector3(f.x, f.y, f.z));
  const q = new THREE.Quaternion().setFromRotationMatrix(m); return { x: q.x, y: q.y, z: q.z, w: q.w };
}

// ------------------------------------------------------------------ dock / launch / jump / death
export function canDock() { const P = app.P, st = app.w?.station; return P && st && !P.dead && vdist(P.pos, st.pos) < st.radius + 60; }
export function dock() {
  const G = app.G; app.mode = 'docked';
  if (app.P && !app.P.dead) storeDamage(G, app.P.grid);
  document.exitPointerLock?.();
  play('dock'); runHooks('dock'); save(G);
  import('./ui/station.js').then(m => m.openStation(app)).catch(e => console.error(e));
}
export function launch() {
  const G = app.G, w = app.w;
  // rebuild the ship from the design + damage (the Shipyard may have changed it)
  w.bodies = w.bodies.filter(b => b !== app.P);
  makePlayer(true);
  app.P.vel = vscale(forward(app.P), 25);
  app.mode = 'fly';
  for (const p of [...$('#panels').children]) p.remove();
  toast('Launched. Safe launch: nothing can hurt you for 6 s.', 'good');
  runHooks('launch');
}
export function jumpTo(sysId) {
  const G = app.G;
  if (app.mode === 'fly' && app.w.t - app.w.combatT < 6) { toast('Too hot to jump — get clear of the fight first.', 'bad'); return false; }
  if (app.P && !app.P.dead) storeDamage(G, app.P.grid);
  G.stats.jumps++;
  play('jump');
  for (const p of [...$('#panels').children]) p.remove();
  app.mode = 'jump'; app.jumpT = 0; app.jumpTo = sysId;
  return true;
}
function finishJump() {
  enterSystem(app.jumpTo, { docked: false });
  save(app.G);
  const g = checkGoals(app.G); if (g) goalDone(g);
}
function playerDied() {
  const G = app.G; G.stats.deaths++;
  app.mode = 'dead'; app.deadT = 0;
  document.exitPointerLock?.();
}
/** Point the aim (and so the nose) at a world point — for tests and Claude's game-eye. */
app.aimAt = p => { if (app.P) rig.aim = vnorm(vsub(p, app.P.pos)); };
app.rig = rig;
app.dock = dock; app.launch = launch; app.jumpTo = jumpTo; app.enterSystem = enterSystem;

// ------------------------------------------------------------------ events from the sim
function ear() { const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion); return { pos: camera.position, right }; }
function handleEvents(w) {
  const G = app.G; const E = ear();
  for (const e of w.events) {
    switch (e.type) {
      case 'fire': {
        // every gun has its own muzzle flash (render/fx.js muzzle), in its glow colour, bigger for better parts
        const m = views.turretShot(e.body, e.turret) || e.pos;
        const k = e.kind; const glow = e.turret.def.glow;
        fx.muzzle(k, m, m.dir || e.dir, e.body.faction === 'swarm' ? '#8dff6a' : glow, e.vis || 0, e.rc || null);
        play(TURRET_VOICE[k] || 'cannon_light', m, E, e.body === app.P ? 0.55 : 0.8, 700);
        break;
      }
      case 'spark':
        // impact sparks in the damage colour; a shield hit only ripples the bubble (no debris)
        fx.impact(e.pos, e);
        if (e.kind === 'rail' && !e.shield) shakeAt(e.pos, 0.35, 40);
        if (!e.small) play(e.shield ? 'shield' : 'hit_kinetic', e.pos, E, 0.6, 500);
        break;
      case 'shieldHit': views.shieldHit(e.body, e.pos); if (e.body === app.P) { app.hud.flash('shield'); edgeFlash(0.16); } break;
      case 'boom':
        fx.explosion(e.pos, e.size, e.color, camera, e.big);
        if (e.dmgType === 'energy' && !e.air) views.scorchAt(w.bodies, e.pos, e.color);      // plasma scorches the hull
        play('boom', e.pos, E, Math.min(1.4, 0.4 + e.size * 0.12), 1500);
        shakeAt(e.pos, Math.min(1, e.size / 8), 40 + e.size * 25);
        if (app.P && vdist(e.pos, app.P.pos) < app.P.radius + e.size) edgeFlash(0.4);
        break;
      case 'blockLost':
        fx.blockLost(e.pos, e.body, e.color); play('blockdie', e.pos, E, 0.6, 600);
        if (e.body === app.P) { app.hud.flash('hull'); app.shake = Math.max(app.shake, 0.35); edgeFlash(0.55); }
        break;
      case 'bump': play('clang', e.pos, E, 0.8); fx.spark(e.pos, '#ffd9a0', 8, 10, 0.4, 0.35); shakeAt(e.pos, 0.3, 30); break;
      case 'shipDown': if (e.player) { play('death'); playerDied(); } else play('death', e.pos, E, 0.8, 2500); break;
      case 'kill': {
        G.stats.kills++; if (e.boss) G.stats.bosses++;
        toast(`Destroyed ${e.body.name}`, 'good');
        if (app.P?.target === e.body) app.P.target = null;
        break;
      }
      case 'pickup': collect(e.pickup); break;
    }
    runHooks('event', e);
  }
  w.events.length = 0;
}
/** Shake the camera by `amount` (0..1) for something at p, fading to nothing `reach` metres away. */
function shakeAt(p, amount, reach) {
  if (!app.P || app.prefs.shake === 'off') return;
  const d = vdist(p, camera.position); const k = Math.max(0, 1 - d / Math.max(1, reach));
  if (k > 0) app.shake = Math.max(app.shake, Math.min(1, amount * k));
}
/** Your own ship took a heavy hit: the screen edges flash red (block losses more than shield hits). */
// It fades by a CSS transition, so it also fades on the death screen and while a window pauses the game.
const hitflash = $('#hitflash'); let edgeA = 0, edgeT = 0;
function edgeFlash(a) {
  if (!hitflash) return;
  const now = performance.now() / 1000; const cur = edgeA * Math.max(0, 1 - (now - edgeT) / 0.5);
  if (a <= cur + 0.05) return;
  edgeA = Math.min(0.9, a); edgeT = now;
  hitflash.style.transition = 'none'; hitflash.style.opacity = edgeA.toFixed(2);
  void hitflash.offsetWidth;                         // apply the jump before starting the fade
  hitflash.style.transition = 'opacity 0.5s ease-out'; hitflash.style.opacity = '0';
}
function collect(k) {
  const G = app.G;
  if (k.kind === 'credits') { G.credits += k.qty; G.stats.earned += k.qty; toast(`+${cr(k.qty)}`, 'gold'); play('coin'); }
  else if (k.kind === 'ore') {
    const room = Math.max(0, app.P.stats.cargo - cargoUsed(G)); const n = Math.min(room, k.qty);
    if (n <= 0) { toast('Cargo full — sell ore at a station or fit a cargo bay.', 'bad'); return; }
    G.cargo[k.ore] = (G.cargo[k.ore] || 0) + n; G.stats.mined += n; play('pickup');
    toast(`+${n} ${ORES[k.ore].name}`, '', ORES[k.ore].color);
  } else if (k.kind === 'item') {
    G.items.push(k.item);
    const r = rarityOf(k.item);
    toast(`Found: ${r.name} ${itemName(k.item)}`, 'loot', r.color);
    if (k.item.rarity >= 4) play('legendary'); else if (k.item.rarity >= 2) play('rare'); else play('pickup');
    if (k.item.rarity >= 3) banner(`${r.name} find!`, itemName(k.item));
  }
  const g = checkGoals(G); if (g) goalDone(g);
}
export function goalDone(g) { banner('Goal complete', `${g.title} · +${cr(g.reward)}`); play('rare'); app.hud?.goal(); }
app.goalDone = goalDone;

// ------------------------------------------------------------------ the frame
let acc = 0, lastT = performance.now(), saveT = 0;
function frame(nowMs) {
  const dtReal = Math.min(0.1, (nowMs - lastT) / 1000); lastT = nowMs; app.lastDt = dtReal;
  const now = nowMs / 1000;
  const inp = input.poll();
  const panelsOpen = $('#panels').children.length > 0;
  if (app.hud) $('#hud').classList.toggle('hidden', app.mode !== 'fly' && app.mode !== 'dead');
  if (app.mode !== 'fly' && app.mode !== 'dead') { const o = $('#overlay'); if (o.dataset.clear !== '1') { o.getContext('2d').clearRect(0, 0, o.width, o.height); o.dataset.clear = '1'; } } else $('#overlay').dataset.clear = '0';
  if (app.mode === 'fly' && app.w) flyFrame(inp, dtReal, now, panelsOpen);
  else if (app.mode === 'docked' && app.w) dockedFrame(inp, dtReal, now);
  else if (app.mode === 'jump') jumpFrame(dtReal, now);
  else if (app.mode === 'dead') deadFrame(inp, dtReal, now);
  else if (app.mode === 'title' || app.mode === 'build') idleFrame(inp, dtReal, now);
  if (app.mode === 'build') { app.builder?.frame(dtReal, inp); requestAnimationFrame(frame); return; }
  fx.update(app.w || { shots: [], beams: [], pickups: [] }, dtReal, camera, now);
  if (app.prefs.quality === 'low') renderer.render(scene, camera); else composer.render();
  if (app.G && app.mode !== 'title') { app.G.playTime += dtReal; saveT += dtReal; if (saveT > 45 && app.mode === 'fly') { saveT = 0; if (app.P && !app.P.dead) storeDamage(app.G, app.P.grid); save(app.G); } }
  requestAnimationFrame(frame);
}

function flyFrame(inp, dt, now, panelsOpen) {
  const w = app.w, P = app.P, G = app.G;
  const paused = panelsOpen;   // any open screen pauses the game (single player)
  if (!paused) {
    // controls → the player's ship
    if (inp.look.x || inp.look.y) turnAim(inp.look.x, inp.look.y);
    if (inp.padLook.x || inp.padLook.y) turnAim(inp.padLook.x * 900 * dt, inp.padLook.y * 700 * dt);
    if (inp.wheel) rig.dist = clamp(rig.dist + inp.wheel * 0.12, 0.6, 3);
    rig.up = vnorm(vlerp(rig.up, upOf(P), Math.min(1, dt * 3)));
    const camPos = camera.position; const look = rig.look || vadd(P.pos, vscale(rig.aim, 1000));
    const toLook = vnorm(vsub(look, camPos));
    const hit = rayWorld(w.bodies, camPos, toLook, 2500, b => b !== P && b.kind !== 'station');
    const aimPoint = hit ? vadd(camPos, vscale(toLook, hit.t)) : vadd(camPos, vscale(toLook, 1200));
    P.input = { thrust: inp.thrust, aimDir: rig.aim, roll: inp.roll, boost: inp.boost, fire: inp.fire && !P.dead, aimPoint, aimBody: hit?.body || null };
    app.aimHit = hit;
    if (inp.pressed.has('lock')) lockTarget();
    if (inp.pressed.has('use') && canDock()) { dock(); return; }
    if (inp.pressed.has('use')) runHooks('action', 'use');   // world: F at an outpost, a merchant, a convoy
    // step the sim
    acc += dt;
    let n = 0;
    while (acc >= DT && n < 6) { snapPrev(w); step(w); handleEvents(w); acc -= DT; n++; }
    if (acc > DT * 6) acc = 0;
    runHooks('frame', dt, now);
    alpha = acc / DT;
    // keep the fight going: new groups arrive now and then, away from you
    if (w.t > w.nextSpawn) { w.nextSpawn = w.t + 70 + Math.random() * 60; const hostiles = w.bodies.filter(b => b.kind === 'ship' && b.team === 'hostile' && !b.dead).length; if (hostiles < 3 + w.sys.danger * 2 && w.posts?.length) { const post = w.posts[Math.floor(Math.random() * w.posts.length)]; if (vdist(post, P.pos) > 1600) spawnGroup(w, post, w.sys, Math.floor(Math.random() * 1e9)); } }
    // sounds that follow state
    loopLevel('mining', P.turrets.filter(t => t.beam && t.kind === 'mining').length);
    boostSound(!!(P.input.boost && (P.cruise || P.boostE > 0.02)) && !P.dead, P.cruise ? 1 : 0.7);
  } else { loopLevel('mining', 0); boostSound(false); }
  if (!paused) {
    if (inp.pressed.has('menu')) app.openMenu?.();
    if (inp.pressed.has('map')) openMap();
    if (inp.pressed.has('hold')) openHold();
    if (inp.pressed.has('goals')) openGoals();
    for (const id of inp.pressed) if (!['menu', 'map', 'hold', 'goals', 'lock', 'use'].includes(id)) runHooks('action', id);
  }
  views.sync(w, now, dt, pose);
  placeCamera(dt, now);
  app.hud.update(dt, now, paused);
}
function lockTarget() {
  const w = app.w, P = app.P; let best = null, bs = 0.97;
  const camF = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  for (const b of w.bodies) {
    if (b.dead || b.kind !== 'ship' || !hostile(P, b)) continue;
    const d = vsub(b.pos, camera.position); const L = vlen(d); if (L > 3000) continue;
    const c = (d.x * camF.x + d.y * camF.y + d.z * camF.z) / L;
    if (c > bs) { bs = c; best = b; }
  }
  if (best) { P.target = best; play('lock'); } else if (P.target) { P.target = null; }
  else toast('No enemy near the crosshair.');
}
function placeCamera(dt, now) {
  const P = app.P; const p = pose(P);
  const R = Math.max(4, P.radius);
  const back = vscale(rig.aim, -R * 2.6 * rig.dist), upOff = vscale(rig.up, R * 0.75 * rig.dist + 1.2);
  const want = vadd(vadd(p.pos, back), upOff);
  rig.pos = want;   // stiff follow: the camera never lags behind the drawn ship (no jitter)
  rig.look = vadd(p.pos, vadd(vscale(rig.aim, 1000), vscale(rig.up, R * 0.6)));
  camera.position.set(want.x, want.y, want.z);
  camera.up.set(rig.up.x, rig.up.y, rig.up.z);
  camera.lookAt(rig.look.x, rig.look.y, rig.look.z);
  if (app.shake > 0 && app.prefs.shake !== 'off') {
    const k = app.shake * (app.prefs.shake === 'gentle' ? 0.35 : 1);
    camera.rotation.x += (Math.random() - 0.5) * 0.02 * k; camera.rotation.y += (Math.random() - 0.5) * 0.02 * k;
    app.shake = Math.max(0, app.shake - dt * 2.5);
  } else app.shake = 0;
  camLight.intensity = 1.2;
  if (sky) sky.root.position.copy(camera.position);
}
function dockedFrame(inp, dt, now) {
  // slow orbit around the station behind the station screens
  const st = app.w.station;
  const a = now * 0.05; const d = st.radius * 2.4;
  camera.position.set(st.pos.x + Math.cos(a) * d, st.pos.y + d * 0.35, st.pos.z + Math.sin(a) * d);
  camera.up.set(0, 1, 0); camera.lookAt(st.pos.x, st.pos.y, st.pos.z);
  alpha = 1;
  for (const b of app.w.bodies) if (b.kind === 'station' || b.kind === 'rock') { b.quat = qnorm(qmul(b.quat, qaxis({ x: 0, y: 1, z: 0 }, dt * 0.02))); }
  views.sync({ ...app.w, bodies: app.w.bodies.filter(b => b !== app.P) }, now, dt, pose);
  if (sky) sky.root.position.copy(camera.position);
  loopLevel('mining', 0); boostSound(false);
}
function jumpFrame(dt, now) {
  app.jumpT += dt;
  camera.fov = app.prefs.fov + Math.min(40, app.jumpT * 25); camera.updateProjectionMatrix();
  if (app.P) { app.P.vel = vscale(forward(app.P), 200 + app.jumpT * 600); app.P.pos = vadd(app.P.pos, vscale(app.P.vel, dt)); views.sync(app.w, now, dt, b => ({ pos: b.pos, quat: b.quat })); placeCamera(dt, now); }
  fx.particle({ x: camera.position.x + (Math.random() - 0.5) * 60, y: camera.position.y + (Math.random() - 0.5) * 60, z: camera.position.z + (Math.random() - 0.5) * 60, vx: 0, vy: 0, vz: 0, life: 0.3, max: 0.3, r: 0.6, g: 0.8, b: 1, size: 0.6 });
  $('#jumpfade').style.opacity = String(clamp((app.jumpT - 1.8) / 0.6, 0, 1));
  if (app.jumpT > 2.6) {
    camera.fov = app.prefs.fov; camera.updateProjectionMatrix();
    finishJump();
    $('#jumpfade').style.opacity = '0';
  }
}
function deadFrame(inp, dt, now) {
  app.deadT += dt;
  // the sim keeps running a few seconds (the wreck tumbles, enemies drift off)
  const w = app.w; acc += dt; while (acc >= DT) { snapPrev(w); step(w); handleEvents(w); acc -= DT; } alpha = acc / DT;
  views.sync(w, now, dt, pose);
  const p = app.P.pos; const a = now * 0.2;
  camera.position.set(p.x + Math.cos(a) * 40, p.y + 15, p.z + Math.sin(a) * 40); camera.lookAt(p.x, p.y, p.z);
  if (sky) sky.root.position.copy(camera.position);
  if (app.deadT > 2.4 && !app.deathShown) { app.deathShown = true; import('./ui/death.js').then(m => m.openDeath(app)).catch(e => console.error(e)); }
  app.hud.update(dt, now, true);
}
function idleFrame(inp, dt, now) {
  // title: a slow drift past a station and a few ships
  if (app.mode !== 'title' || !app.titleScene) return;
  app.titleScene(dt, now);
}

// ------------------------------------------------------------------ screens
function openMap() { import('./ui/starmap.js').then(m => m.openStarMap(app)).catch(e => console.error(e)); }
function openHold() { import('./ui/hold.js').then(m => m.openHold(app)).catch(e => console.error(e)); }
function openGoals() { import('./ui/goals-ui.js').then(m => m.openGoals(app)).catch(e => console.error(e)); }
app.openMap = openMap; app.openHold = openHold; app.openGoals = openGoals;
app.closeTop = () => { const top = $('#panels').lastElementChild; if (!top) return false; (top.closePanel || (() => top.remove()))(); return true; };
// Esc closes the top screen (a screen's own key closes it too)
addEventListener('keydown', e => {
  if (e.code !== 'Escape' || app.mode === 'build') return;
  if ($('#panels').children.length && !document.querySelector('.gdlg-modal, .wn-modal, .cr-modal, .rgs-signin')) { e.stopImmediatePropagation(); app.closeTop(); }
}, true);
view.addEventListener('click', () => {
  resumeAudio();
  if (app.mode === 'fly' && !$('#panels').children.length && document.pointerLockElement !== view) view.requestPointerLock?.()?.catch?.(() => {});
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && app.mode === 'fly' && !$('#panels').children.length && app.lockedOnce) app.openMenu?.();
  if (document.pointerLockElement) app.lockedOnce = true;
});
addEventListener('pointerdown', () => { initAudio().then(resumeAudio); }, { once: false });

// ------------------------------------------------------------------ start a game
export function startGame(G) {
  app.G = G; app.gal = generateGalaxy(G.galaxySeed);
  app.hud = app.hud || createHud(app);
  $('#title')?.classList.add('hidden');
  app.titleScene = null;
  enterSystem(G.system, { docked: true });
  applyPrefs();
}
app.startGame = startGame;

// ------------------------------------------------------------------ for Claude's game-eye and tests
window.gameEye = {
  state() {
    const G = app.G, P = app.P, w = app.w;
    return {
      mode: app.mode, build: BUILD,
      player: P ? { pos: { x: Math.round(P.pos.x), y: Math.round(P.pos.y), z: Math.round(P.pos.z) }, hp: Math.round(P.stats.hp), maxHp: Math.round(P.stats.maxHp), shield: Math.round(P.shield), blocks: P.grid.cells.size, turrets: P.turrets.length, speed: Math.round(vlen(P.vel)), dead: P.dead, target: P.target?.name || null } : null,
      game: G ? { credits: G.credits, cargo: G.cargo, items: G.items.length, system: G.system, goal: currentGoal(G)?.id || null, stats: G.stats } : null,
      world: w ? { t: Math.round(w.t), bodies: w.bodies.length, hostiles: w.bodies.filter(b => b.kind === 'ship' && b.team === 'hostile' && !b.dead).length, shots: w.shots.length, pickups: w.pickups.length, combat: Math.round(w.t - w.combatT) } : null,
      panels: [...$('#panels').children].map(p => p.querySelector('h2')?.textContent || p.className),
    };
  },
  health() { return { fps: Math.round(1 / Math.max(0.001, app.lastDt || 0.016)) }; },
};

// controller in menus whenever flight does not own the pad
import('./ui/padnav.js').then(({ createPadNav }) => {
  app.padnav = createPadNav({ busy: () => (app.mode === 'fly' && !$('#panels').children.length) || (app.mode === 'build' && !!$('#panels').lastElementChild?.classList.contains('builder')), back: () => app.closeTop() });
}).catch(e => console.info('[hullforge] pad menus unavailable', e?.message));
// cloud saves while signed in to games.radgh.com (saves stay per game)
import('../../../shared/rgs-cloudsave.js').then(({ cloudSave }) => {
  app.cloud = cloudSave({ game: 'hullforge', keys: { prefs: PREFS_KEY, last: 'hullforge.last' }, prefixes: { slots: 'hullforge.slot.' }, canRestore: () => app.mode === 'title', onRestore: () => location.reload() });
}).catch(e => console.info('[hullforge] cloud saves unavailable', e?.message));

applyPrefs();
import('./ui/menu.js').then(m => m.initMenu(app)).catch(e => console.error(e));
import('./ui/title.js').then(m => m.showTitle(app)).catch(e => console.error(e));
import('./ui/economy-ext.js').then(m => m.initEconomy(app)).catch(e => console.error(e));   // economy: trade, research, workshop, insurance
import('./ui/world-ext.js').then(m => m.initWorld(app)).catch(e => console.error(e));   // world: factions, jobs, encounters, outposts, drones, harpoon, scan
requestAnimationFrame(frame);
