// Voidwright — the app: title screen, the flight loop, camera, HUD, docking, jumping, death, saves.
// The sim (js/sim) is pure; this file feeds it input and turns its events into pictures, sound and UI.

import { createWorld, step, hostile, fireHarpoon, launchDrone, repair, spawnPickup, cargoUsed, GRACE_SECONDS, BOOST_RELOCK, crewText } from './sim/world.js';
import { generateGalaxy, populate, spawnGroup, SAFE_RADIUS, canWarpTo, warpCore, coreFor } from './sim/galaxy.js';
import { streamSectors } from './sim/sectors.js';
import { newGame, playerShip, storeShip, save, load, slots, lastSlot, sysMem, fittedDrones, makeDroneItem } from './sim/state.js';
import { checkQuests, CHAPTERS, UNLOCK_NAMES, unlockFromFind } from './sim/quests.js';
import { rollLoot, makeItem, rollRarity } from './sim/loot.js';
import { recompute } from './sim/ship.js';
import { createRenderer } from './render/draw.js';
import { createFx, handleEvent, stepFx, ring, wave } from './render/fx.js';
import { scanPulse, scanSummary, scanLabel, rockOre } from './sim/scan.js';
import { reveal, worthRevealing } from './ui/reveal.js';
import { snapPrev, blendIn, blendOut } from './render/smooth.js';
import { createInput } from './core/input.js';
import { initAudio, resumeAudio, play, lib, loopLevel, setVolume, setMuted, ambience, boostSound } from './core/audio.js';
import { rng, hash, clamp, TAU } from './core/math.js';
import { FACTIONS } from './data/factions.js';
import { CLASSES } from './data/hulls.js';
import { DAMAGE_IDS, DAMAGE, ARMOR, MATERIALS, RARITY_BY_ID, OLD_MATERIALS } from './data/types.js';
import { DRONES } from './data/drones.js';
import { BLOCKS } from './data/blocks.js';
import { $, el, btn, toast, banner, panel, modal, fmt, km } from './ui/dom.js';
import { drawMinimap } from './ui/minimap.js';
// expansion: mercenary wingmen (sim/mercs.js) and planet outposts (sim/colony.js) — hooks marked [wing] / [outpost]
import { spawnWing, storeWing, wingTick } from './sim/mercs.js';
import { placeOutposts, colonyTick, planetInteract } from './sim/colony.js';

const BUILD = '2026-11-12';
const COARSE = matchMedia?.('(pointer: coarse)').matches;
const app = window.app = {
  G: null, w: null, P: null, galaxy: null, mode: 'title', cam: { x: 0, y: 0, zoom: 1, zoomMul: 1 }, fx: null, R: null, input: null,
  paused: false, lock: null, settings: loadSettings(), acc: 0, jump: null, deadT: 0, spawnT: 30, saveT: 60, lastNoteKill: 0,
};
function loadSettings() { try { return { volume: 0.7, quality: 1, muted: false, shake: 1, ...JSON.parse(localStorage.getItem('voidwright.prefs') || '{}') }; } catch { return { volume: 0.7, quality: 1, muted: false, shake: 1 }; } }
export function saveSettings() { try { localStorage.setItem('voidwright.prefs', JSON.stringify(app.settings)); } catch { /* private */ } }

// ------------------------------------------------------------------ boot
const view = $('#view'), overlay = $('#overlay');
app.R = createRenderer(view, overlay);
app.R.quality = app.settings.quality;
app.fx = createFx(app.settings.quality >= 1 ? 1 : 0.5);
app.input = createInput(view);
setVolume(app.settings.volume); setMuted(app.settings.muted);
addEventListener('pointerdown', async () => { await initAudio(); resumeAudio(); setVolume(app.settings.volume); setMuted(app.settings.muted); ambience('ambience.void'); }, { once: false });

// a demo battle behind the title screen
function titleScene() {
  const gal = generateGalaxy(4242); const sys = gal.systems[gal.start];
  const w = createWorld({ seed: 7 }); populate(w, sys, {}, {});
  w.bodies = w.bodies.filter(b => b.kind !== 'ship' || Math.hypot(b.x - 2400, b.y) < 3000);
  const r = rng(9);
  spawnGroup(w, { x: 2200, y: -200 }, 'redfang', 2, r, 'pack');
  const g2 = spawnGroup(w, { x: 2700, y: 300 }, 'navy', 2, r, 'pack'); for (const s of g2) s.team = 'friendly';
  app.w = w; app.cam = { x: 2450, y: 0, zoom: 0.9, zoomMul: 1 }; app.mode = 'title'; app.R.setSystem(sys);
}

function showTitle() {
  app.mode = 'title'; $('#hud').classList.add('hidden'); $('#title').classList.remove('hidden'); $('#panels').innerHTML = '';
  titleScene();
  const box = $('#title-buttons'); box.innerHTML = '';
  const last = lastSlot(); const list = slots();
  if (last >= 0 && list[last]) box.append(btn(`Continue — ${list[last].name}, ${list[last].ship}`, () => startGame(load(last)), 'big primary'));
  box.append(btn('New game', () => newGameDialog(), 'big'));
  if (list.some(Boolean)) box.append(btn('Load a save', () => loadDialog()));
  const extra = $('#title-extra'); extra.innerHTML = '';
  extra.append(btn('Settings', () => settingsDialog(), 'small'));
  import('../../../shared/whats-new.js').then(({ createWhatsNew }) => {
    app.news = createWhatsNew({ url: new URL('../data/changelog.json', import.meta.url), key: 'voidwright', title: "What's new" });
    extra.append(app.news.button({ label: "What's new" }));
  }).catch(() => {});
  import('../../../shared/credits.js').then(({ createCredits }) => {
    app.credits = createCredits({ game: 'prototypes/voidwright', made: 'Voidwright — by Radley Sustaire, built with Claude.' });
    extra.append(app.credits.button({ label: 'Credits' }));
  }).catch(() => {});
  import('../../../shared/rgs-signin.js').then(({ accountButton }) => { const b = accountButton({ game: 'voidwright', gameName: 'Voidwright' }); if (b) extra.append(b); }).catch(() => {});
}

function newGameDialog() {
  modal('New game', (m, close) => {
    const list = slots(); const free = list.findIndex(x => !x);
    const name = el('input', { value: 'Captain', maxlength: 20 });
    const seed = el('input', { value: String((Math.random() * 1e6) | 0), inputmode: 'numeric', maxlength: 9 });
    const slotSel = el('select', {}, ...[0, 1, 2, 3].map(i => el('option', { value: i, selected: i === (free < 0 ? 0 : free) }, `Slot ${i + 1}${list[i] ? ` (replaces ${list[i].name})` : ' (empty)'}`)));
    m.append(el('label', {}, 'Your name ', name), el('label', {}, 'Galaxy seed ', seed), el('label', {}, 'Save slot ', slotSel),
      el('p', { class: 'hint' }, 'You start in a tiny mining ship at the edge of the galaxy. Danger — and reward — grows the further in you fly.'),
      el('div', { class: 'row end' }, btn('Cancel', close), btn('Launch', () => { close(); const G = newGame({ seed: +seed.value || 1, slot: +slotSel.value, name: name.value || 'Captain' }); save(G); startGame(G); }, 'primary big')));
  });
}
function loadDialog() {
  modal('Load a save', (m, close) => {
    slots().forEach((s, i) => {
      if (!s) return;
      const when = s.savedAt ? new Date(s.savedAt).toLocaleString() : '';
      m.append(btn(el('span', { class: 'slot' }, el('span', {}, `${s.name} — ${s.ship} (${CLASSES[s.cls]?.name || s.cls})`), el('small', {}, `${fmt(s.credits)} cr · ${when}`)), () => { close(); startGame(load(i)); }));
    });
    m.append(btn('Back', close));
  });
}

// ------------------------------------------------------------------ game start / systems
function startGame(G) {
  if (!G) { toast('That save could not be read.', 'bad'); return; }
  app.G = G; app.galaxy = generateGalaxy(G.seed);
  migrate(G);
  ensureBosses();
  $('#title').classList.add('hidden'); $('#hud').classList.remove('hidden');
  enterSystem(G.system, G.docked != null ? 'dock' : 'start');
  if (G.quest.chapter === 0 && !G.quest.seenIntro) { G.quest.seenIntro = true; setTimeout(() => banner(CHAPTERS[0].title, CHAPTERS[0].text), 900); }
  updateQuest();
}

/** Bring an older save up to date. */
function migrate(G) {
  G.drive ||= 1;   // warp core class (every save starts on Class I; safer stars are always reachable)
  // 2026-11-12 expansion: materials folded into rock + 3 per tier; drones became items; passengers gone
  if (!G.fixes?.exp1) {
    for (const bag of [G.cargo, G.goods]) for (const [k, v] of Object.entries(bag || {})) if (OLD_MATERIALS[k]) { bag[OLD_MATERIALS[k]] = (bag[OLD_MATERIALS[k]] || 0) + v; delete bag[k]; }
    G.markets = {}; G.priceMemory = {};
    G.droneItems ||= []; G.ship.drones ||= [];
    for (const k of G.drones || []) { const d = makeDroneItem(k); G.droneItems.push(d); G.ship.drones.push(d.uid); }
    delete G.drones; delete G.passengers;
    G.caches ||= []; G.uniques ||= [];
    for (const c of G.claims || []) if (OLD_MATERIALS[c.mat]) c.mat = OLD_MATERIALS[c.mat];
    (G.fixes ||= {}).exp1 = true;
  }
  // 2026-11-11: friendly fire used to sour the Guild/Navy until their stations opened fire on sight. Friendly
  // fire is gone, and so is that grudge.
  // 2026-11-12: a salvage lot with Rock in it could pay out Infinity credits; put such saves back on their feet
  if (!Number.isFinite(G.credits)) G.credits = 25000;
  if (!G.fixes?.repReset) {
    for (const [f, F] of Object.entries(FACTIONS)) if (!F.hostile) G.rep[f] = Math.max(G.rep[f] ?? 0, 0);
    (G.fixes ||= {}).repReset = true;
  }
}

/** Roaming giants (PLAN §0 #18): a few huge ships that wander the galaxy; rumours on the star map. */
function ensureBosses() {
  const G = app.G; if (G.bosses?.length) return;
  const r = rng(hash('bosses', G.seed));
  const list = [
    { cls: 'battleship', faction: 'redfang', name: 'The Red Widow' }, { cls: 'dreadnought', faction: 'kharr', name: 'Mountain-That-Walks' },
    { cls: 'carrier', faction: 'lattice', name: 'The Loom' }, { cls: 'dreadnought', faction: 'vesh', name: 'Hive Mother Qeth' },
    { cls: 'battleship', faction: 'ossari', name: 'Cantor of Shattered Light' },
  ];
  // never parked at home or next door: they are out there to be found
  const far = app.galaxy.systems.filter(s => s.jumps >= 2);
  G.bosses = list.map((b, i) => ({ ...b, id: 'boss' + i, seed: hash(G.seed, 'boss', i), tier: 6 + (i % 3), system: r.pick(far).id, alive: true, moveAt: 600 + r() * 600 }));
}
function moveBosses() {
  const G = app.G; const r = rng(hash(G.seed, Math.floor(G.playTime / 60)));
  for (const b of G.bosses) {
    if (!b.alive || G.playTime < b.moveAt) continue;
    const sys = app.galaxy.systems[b.system]; const next = sys.links.filter(l => app.galaxy.systems[l].jumps >= 2 && l !== G.system);
    if (next.length) b.system = r.pick(next); b.moveAt = G.playTime + 500 + r() * 700;
  }
}

function enterSystem(id, how = 'jump', from = null) {
  const G = app.G; const sys = app.galaxy.systems[id];
  G.system = id; if (!G.visited.includes(id)) G.visited.push(id);
  for (const l of sys.links) if (!G.seenSystems.includes(l)) G.seenSystems.push(l);
  G.stats.maxTier = Math.max(G.stats.maxTier, sys.tier);
  const w = createWorld({ seed: hash(sys.seed, G.playTime | 0), game: G });
  const boss = G.bosses.find(b => b.alive && b.system === id);
  populate(w, sys, sysMem(G, id), { boss });
  placeOutposts(G, w);   // [outpost] your outposts in this system
  const P = playerShip(G); P.x = 0; P.y = 0;
  const st = w.stations.find(s => s.dockable && s.team !== 'hostile');
  if (how === 'dock' && st) { const da = G.dockAngle ?? 0; P.x = st.x + Math.cos(da) * (st.r + 200); P.y = st.y + Math.sin(da) * (st.r + 200); P.a = da; }
  else if (how === 'start') { const a = st ? Math.atan2(st.y, st.x) : 0; P.x = (st ? st.x : 3000) + Math.cos(a) * ((st?.r || 0) + 500); P.y = (st ? st.y : 0) + Math.sin(a) * ((st?.r || 0) + 500); }
  else {
    // arrive at the jump point on the side you came from, a short flight from the middle (systems are huge)
    const fromSys = from != null ? app.galaxy.systems[from] : null;
    const a = fromSys ? Math.atan2(fromSys.y - sys.y, fromSys.x - sys.x) : Math.random() * TAU;
    P.x = Math.cos(a) * 7000; P.y = Math.sin(a) * 7000; P.a = a + Math.PI;
  }
  w.bodies.push(P); w.player = P; app.w = w; app.P = P;
  P.grace = w.t + GRACE_SECONDS;
  if (st) clearDoorstep(w, st);
  for (let i = 0; i < 9; i++) streamSectors(w, P.x, P.y);   // the sectors around you are ready on arrival
  launchWing(w, P);
  spawnWing(app);   // [wing] mercenary wingmen arrive with you
  app.R.setSystem(sys);
  app.cam.x = P.x; app.cam.y = P.y;
  app.mode = 'fly'; app.spawnT = 12 + Math.random() * 10; app.lock = null; app.waypoint = null;
  $('#st-system').textContent = `${sys.name} · Danger ${sys.tier}`;
  $('#st-system').style.color = sys.tier >= 7 ? '#ff5a6a' : sys.tier >= 4 ? '#ffc45a' : '#8fd8ff';
  if (how === 'jump') {
    G.stats.jumps++;
    const owner = FACTIONS[sys.owner];
    toast(`${sys.name}: ${owner.name} space${boss ? ' — something enormous is here' : ''}`, sys.tier >= 5 ? 'bad' : '');
  }
  if (how === 'dock' && st) dockAt(st);
}

// ------------------------------------------------------------------ the loop
let lastT = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now; app.lastDt = app.lastDt ? app.lastDt * 0.9 + dt * 0.1 : dt;
  const raw = app.input.read();
  try { frame(dt, raw); } catch (e) { console.error(e); }
  requestAnimationFrame(loop);
}

function frame(dt, raw) {
  const w = app.w; if (!w) return;
  const G = app.G; const P = app.P;
  // world input for the player
  let inp = { mx: 0, my: 0, ax: 0, ay: 0 };
  panelKeys(raw);   // #51: a menu's own key closes it again
  const live = app.mode === 'fly' && P && !P.dead;
  if (live) {
    const cam = app.cam; const vw = view.clientWidth, vh = view.clientHeight;
    let ax, ay;
    if (raw.aimStick) { const reach = 380 + P.r * 2; ax = P.x + raw.aimStick[0] * reach; ay = P.y + raw.aimStick[1] * reach; }
    else if (raw.aimTouch) { ax = (raw.aimTouch[0] - vw / 2) / cam.zoom + cam.x; ay = (raw.aimTouch[1] - vh / 2) / cam.zoom + cam.y; }   // #49: hold where you want to shoot
    else { ax = (raw.aimX - vw / 2) / cam.zoom + cam.x; ay = (raw.aimY - vh / 2) / cam.zoom + cam.y; }
    if (!raw.aimStick && !raw.aimTouch && raw.device !== 'kb' && P.input) { ax = P.x + Math.cos(P.a) * 300; ay = P.y + Math.sin(P.a) * 300; }
    inp = { mx: raw.mx, my: raw.my, ax, ay, fire: raw.fire, missile: raw.missile && G.unlocked.missiles !== false, boost: raw.boost, reel: raw.reel };
    // cruise: well away from any fight the engines open up, so the big systems are quick to cross
    inp.cruise = app.cruise = cruiseOK();
    // missile lock: hostile nearest the aim point
    let lock = null, bd = (260 / cam.zoom) ** 2;
    for (const s of w.bodies) { if (s.dead || !hostile(w, P, s) || s.cloak > 0) continue; const d = (s.x - ax) ** 2 + (s.y - ay) ** 2 - s.r * s.r; if (d < bd) { bd = d; lock = s; } }
    // #49: on a phone missiles look after themselves — lock the enemy nearest your ship and fire whenever a rack is ready
    if (raw.device === 'touch') {
      const auto = touchMissiles(w, P, lock);
      if (auto) { lock = auto; inp.missile = G.unlocked.missiles !== false; }
    }
    if (lock !== app.lock && lock && P.turrets.some(t => t.w.mode === 'lock')) play('lock');
    app.lock = lock; inp.lock = lock;
    if (raw.harpoonPressed) { const r = fireHarpoon(w, P); if (r === 'none') toast('No harpoon fitted. Outfitters sell them.', 'bad'); else if (r === 'fired') play('harpoon', P.x, P.y, camAudio()); }
    if (raw.utilityPressed) useUtility();
    if (raw.scanPressed) doScan();
    if (raw.interactPressed) interact();
    if (raw.buildPressed) openBuild();
    if (raw.mapPressed) { if (G.unlocked.galaxy) openMap(); else openLocal(); }
    if (raw.localPressed) openLocal();
    if (raw.questsPressed) openQuests();
    if (raw.dronesPressed) openHold('drones');
    if (raw.holdPressed) openHold('cargo');   // #52: I = inventory
    if (raw.wheel) app.cam.zoomMul = clamp(app.cam.zoomMul * (raw.wheel > 0 ? 0.88 : 1.13), 0.3, 2.4);
  }
  if (raw.menuPressed) { if ($('#panels').children.length) closeTopPanel(); else if (app.mode === 'fly') openMenu(); }
  // sim (fixed step)
  const simOn = app.mode === 'fly' || app.mode === 'title' || app.mode === 'dead' || app.mode === 'jumping';
  if (simOn) {
    app.acc += dt; let n = 0;
    while (app.acc >= 1 / 60 && n < 4) { snapPrev(w); step(w, 1 / 60, inp); app.acc -= 1 / 60; n++; }
    if (n === 4) app.acc = 0;
    if (G) G.playTime += dt;
  }
  // events → fx + sound
  const camA = camAudio();
  const isPlayer = id => P && id === P.id;
  for (const e of w.events) {
    handleEvent(app.fx, e, { isPlayer });
    sound(e, camA);
    if (e.t === 'scorch') { const pl = w.planets.find(p => p.id === e.planet); if (pl) app.R.scorchPlanet(pl, e.x, e.y); }
  }
  w.events.length = 0;
  stepFx(app.fx, dt);
  // beam loops
  let beamN = 0, mineN = 0; for (const b of w.beams) { if (b.owner !== P?.id) continue; if (b.tool === 'mine') mineN++; else beamN++; }
  loopLevel('beam', beamN); loopLevel('mining', mineN);
  // boost (report #36): one 0..1 number eases in/out and drives the flames, speed lines, camera pull-back, post blur and roar
  const boostOn = !!(app.mode === 'fly' && P && !P.dead && P.boosting && Math.hypot(P.vx, P.vy) > 30);
  app.boostFx = (app.boostFx || 0) + ((boostOn ? 1 : 0) - (app.boostFx || 0)) * (1 - Math.exp(-dt * (boostOn ? 6 : 3)));
  boostSound(boostOn, boostOn ? 0.6 + 0.4 * (P.boostFuel ?? 1) : 0);
  // notes (kills, pickups, reputation…)
  if (G) handleNotes(w.notes); w.notes.length = 0;
  if (live) { spawner(dt); prompts(); droneUpkeep(dt); weather(dt); stream(dt); wingTick(app, dt); colonyTick(app, dt); app.encTick?.(dt); }   // [wing] [outpost] [encounters: ui/missions.js]
  if (app.mode === 'dead') { app.deadT -= dt; if (app.deadT <= 0 && !app.deathShown) { app.deathShown = true; deathPanel(); } }
  if (app.mode === 'jumping') jumpTick(dt);
  // app.P, not the P read at the top of the frame: Escape / Start can undock mid-frame (closeTopPanel → undock), which
  // retires the old ship (old.dead = true) — checking that one made "Undock with Escape" show Ship destroyed (2026-11-12)
  if (app.P && app.P.dead && app.mode === 'fly') onPlayerDeath();
  if (G && app.mode === 'fly') { app.saveT -= dt; if (app.saveT <= 0) { app.saveT = 60; storeWing(app); storeShip(G, P); save(G); } moveBosses(); }
  // draw everything between the last two sim steps (report #35 judder), and point the camera at the DRAWN ship
  blendIn(w, simOn ? app.acc * 60 : 1);
  if (app.mode === 'title') { const t = w.t * 0.05; app.cam.x = 2450 + Math.cos(t) * 300; app.cam.y = Math.sin(t) * 200; app.cam.zoom = 0.8; }
  else if (P) updateCamera(dt, inp);
  try { app.R.frame(w, app.cam, app.fx, { overlay: drawOverlay, worldOverlay: app.worldOverlay || app.encOverlay || null, ambient: 0.8, bloom: app.settings.quality >= 1 ? 0.75 : 0.5, boost: app.boostFx || 0 }); }
  finally { blendOut(w); }
  if (G && app.mode !== 'title') updateHud();
}

const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
function camAudio() { return { x: app.cam.x, y: app.cam.y, zoom: app.cam.zoom, w: view.clientWidth }; }

function updateCamera(dt, inp) {
  const P = app.P; const vw = view.clientWidth, vh = view.clientHeight;
  const base = clamp(Math.min(vw, vh) * (vw < 640 ? 0.19 : 0.15) / (P.r + 30), 0.07, 2.6);
  // boosting pulls the camera back a little (a 'wider field of view' kick) and it eases back after
  const z = base * app.cam.zoomMul * (app.mode === 'jumping' ? 0.85 : 1) * (1 - 0.14 * (app.boostFx || 0));
  app.cam.zoom += (z - app.cam.zoom) * (1 - Math.exp(-dt * 3));
  const lookX = (inp.ax - P.x) * 0.18 + P.vx * 0.35, lookY = (inp.ay - P.y) * 0.18 + P.vy * 0.35;
  const lim = Math.min(vw, vh) * 0.3 / app.cam.zoom;
  const tx = P.x + clamp(lookX || 0, -lim, lim), ty = P.y + clamp(lookY || 0, -lim, lim);
  // frame-rate independent easing, so 60 Hz and 144 Hz screens follow the same curve
  const k = 1 - Math.exp(-dt * 5);
  app.cam.x += (tx - app.cam.x) * k; app.cam.y += (ty - app.cam.y) * k;
}

// ------------------------------------------------------------------ sound for events
function sound(e, cam) {
  switch (e.t) {
    case 'fire': { const v = soundFor(e.w); if (v) play(v, e.x, e.y, cam, e.drone ? 0.5 : (e.team === 'player' ? 1 : 0.75)); break; }
    case 'hit': play('hit_' + (e.type || 'kinetic'), e.x, e.y, cam, 0.6); break;
    case 'shieldhit': play('shield', e.x, e.y, cam, 0.7); break;
    case 'shielddown': play('shielddown', e.x, e.y, cam); break;
    case 'blockdie': play('blockdie', e.x, e.y, cam, 0.8); break;
    case 'boom': play('boom', e.x, e.y, cam, Math.min(1.2, 0.4 + e.r / 80)); break;
    case 'death': play('death', e.x, e.y, cam, Math.min(1.5, 0.6 + e.r / 150)); lib(e.r > 150 ? 'explosion.large' : 'explosion.small'); break;
    case 'arc': play('arc', e.pts[0][0], e.pts[0][1], cam, 0.7); break;
    case 'rail': play(e.big ? 'lance' : 'rail', e.x, e.y, cam); break;
    case 'clang': play('clang', e.x, e.y, cam); break;
    case 'hook': play('hook', e.x, e.y, cam); break;
    case 'collect': if (e.kind === 'cr') play('coin'); else if (e.kind === 'item') { const ri = RARITY_BY_ID[e.rarity]?.index || 0; if (ri >= 4) play('legendary'); else if (ri >= 2) play('rare'); else play('pickup'); lib(`loot.${['common', 'uncommon', 'rare', 'epic', 'legendary', 'legendary'][ri]}`); } else play('pickup'); break;
    case 'drop': { const ri = RARITY_BY_ID[e.rarity]?.index || 0; if (ri >= 3) play(ri >= 4 ? 'legendary' : 'rare', e.x, e.y, cam, 0.8); break; }
    case 'rebuilt': play('rebuilt', e.x, e.y, cam, 0.5); break;
    case 'lockwarn': if (e.onPlayer) play('lock', e.x, e.y, cam, 0.8); break;   // #66: an enemy salvo is about to launch at you
    case 'decoy': play('decoy', e.x, e.y, cam, 0.8); break;
  }
}
const WSOUND = {
  pulse_laser: 'laser_pulse', heavy_laser: 'laser_heavy', gatling: 'gatling', autocannon: 'cannon_light', howitzer: 'cannon_heavy', siege_cannon: 'siege', scatter: 'scatter',
  mass_driver: 'mass_driver', forge_hammer: 'mass_driver', rocket_pod: 'rocket', missile_rack: 'missile', swarm_pod: 'missile', torpedo_tube: 'torpedo', spore_launcher: 'spore',
  arc_caster: 'arc', tesla_coil: 'tesla', storm_spire: 'tesla', lattice_arc: 'arc', flak: 'flak', flak_battery: 'flak', pd_laser: 'pd', plasma_cannon: 'plasma', magma_mortar: 'plasma',
  acid_spitter: 'acid', railgun: 'rail', lance_battery: 'lance', mine_layer: 'mine', ion_pulse: 'ion', prism_lance: 'prism', harpoon: 'harpoon',
  // missile kinds (#57): each warhead has its own launch voice (core/audio.js)
  ram_rack: 'ram_missile', ram_battery: 'ram_missile', he_rack: 'he_missile', he_battery: 'he_missile',
  emp_rack: 'emp_missile', emp_battery: 'emp_missile', ion_silo: 'emp_missile', fire_rack: 'fire_missile', fire_battery: 'fire_missile',
};
const soundFor = id => WSOUND[id] || (id?.startsWith('drone_') ? id : null);

// ------------------------------------------------------------------ notes from the sim
function handleNotes(notes) {
  const G = app.G; const w = app.w;
  for (const n of notes) {
    app.encNote?.(n);   // [encounters] wanted bounties + galaxy-event bounties (ui/missions.js)
    switch (n.t) {
      case 'kill': {
        if (n.kind === 'ground') { const s = w.bodies.find(b => b.id === n.id); if (s?.gid) sysMem(G, G.system).dead.push(s.gid); }
        if (n.kind === 'station') { const s = w.bodies.find(b => b.id === n.id); if (s?.stronghold) { G.stats.strongholds++; sysMem(G, G.system).dead.push('pirateBase'); banner('Stronghold destroyed', 'Its treasure is yours.'); } else if (s?.gid) sysMem(G, G.system).dead.push(s.gid); }
        G.stats.kills++; G.stats.killsBy[n.faction] = (G.stats.killsBy[n.faction] || 0) + 1; G.stats.killsCls[n.cls] = (G.stats.killsCls[n.cls] || 0) + 1;
        if (n.boss) { G.stats.bossKills++; const b = G.bosses.find(x => x.name === n.name); if (b) b.alive = false; banner(`${n.name} is destroyed`, 'The galaxy will be talking about this.'); }
        for (const bt of G.bounties) if (!bt.done && bt.faction === n.faction && (!bt.cls || bt.cls === n.cls) && bt.system === G.system) { bt.got = (bt.got || 0) + 1; if (bt.got >= bt.need) { bt.done = true; toast(`Bounty complete: ${bt.title} — collect at a bounty board`, 'good'); } }
        break;
      }
      case 'collect': {
        if (n.kind === 'mat' && n.ore) G.stats.mined += n.n;
        if (n.kind === 'drone') { const D = DRONES[n.item?.kind]; const R = RARITY_BY_ID[n.rarity || 'common']; toast(`Drone recovered: ${R.index ? R.name + ' ' : ''}${D?.name || 'drone'} — choose it in the hold (C)`, 'loot', R.color); }
        if (n.kind === 'cache') toast('Sealed cache recovered — open it at any station workshop', 'good', '#ffd84a');
        if (n.kind === 'data') toast(`+${n.n} data core${n.n > 1 ? 's' : ''} (research labs buy them)`, 'good', '#7af7ff');
        if (n.kind === 'specimen') { G.stats.specimens++; toast(`Recovered: ${n.name}`, 'good', '#c8ff6a'); }
        if (n.kind === 'item') {
          const R = RARITY_BY_ID[n.rarity];
          if (worthRevealing(n.item)) { reveal(app, n.item); if (n.item.unique || R.index >= 4) { play('legendary'); app.fx.flash = Math.max(app.fx.flash, 0.25); app.fx.flashColor = hexRgb(R.color); } }
          else toast(`${n.item.name}`, 'loot', R.color);
          const u = unlockFromFind(G, n.item); if (u) banner('Found something new', '', [UNLOCK_NAMES[u]]);
          if (!G.unlocked.build && !app.toldHold) { app.toldHold = true; toast('Parts go to your parts hold (☰ menu). Build mode unlocks soon.', ''); }
        }
        break;
      }
      case 'crew': G.stats.rescued += n.n; toast(crewText(n.n), n.n ? 'good' : ''); break;   // #55: just '+3 crew'
      case 'crewlost': toast(`−${n.n} Crew`, 'bad'); break;
      case 'full': toast('Cargo full — tap Cargo to see it. Sell at a market or dump some.', 'bad'); break;
      case 'rep': toast(`${FACTIONS[n.faction].short}: ${n.why} (${n.d > 0 ? '+' : ''}${n.d})`, n.d < 0 ? 'bad' : 'good'); break;
      case 'enrage': banner(`${n.name} is enraged!`); play('warn'); break;
      // #66: a big ship (or base) locks a missile salvo on you — say so, and what stops one
      case 'salvo': toast(`Missile lock: ${n.name} — point defence, flak, a Blast Screen or decoys stop missiles`, 'bad'); play('warn'); break;
    }
  }
  updateQuest();
}

export function updateQuest() {
  const G = app.G; if (!G) return;
  for (const ch of checkQuests(G)) {
    const news = ch.unlock.map(u => UNLOCK_NAMES[u]).filter(Boolean);
    banner(`Done: ${ch.title}`, ch.reward?.cr ? `+${fmt(ch.reward.cr)} credits` : '', news);
    play('rare'); save(G);
    const next = CHAPTERS[G.quest.chapter];
    if (next) setTimeout(() => toast(`Next: ${next.title}`, 'good'), 4800);
  }
  const ch = CHAPTERS[G.quest.chapter]; const q = $('#quest');
  if (!ch) { q.innerHTML = '<b>All goals complete</b><p>The galaxy is yours. Keep building.</p>'; q.classList.remove('hidden'); return; }
  const have = Math.min(ch.need, ch.goal(G));
  q.innerHTML = `<b>${ch.title}</b><p>${ch.text}</p><span class="hint">${fmt(have)} / ${fmt(ch.need)} ${ch.unit}</span><div class="prog"><i style="width:${(have / ch.need * 100).toFixed(1)}%"></i></div>`;
  q.classList.remove('hidden');
}
$('#quest').addEventListener('click', () => $('#quest').classList.toggle('min'));
if (innerWidth < 640) $('#quest').classList.add('min');   // phones: just the title and the bar until tapped

// ------------------------------------------------------------------ spawning while you fly
function spawner(dt) {
  const w = app.w, P = app.P, G = app.G; const sys = w.system;
  app.spawnT -= dt; if (app.spawnT > 0) return;
  // about three times as often as before (play-test: "no enemies, nothing to kill"), more in busy systems
  const busy = sys.traits?.enemies ?? 1;
  app.spawnT = (Math.max(12, 32 - sys.tier * 2) + Math.random() * 18) / busy;
  const near = w.bodies.filter(b => b.kind === 'ship' && b.team === 'hostile' && !b.dead && Math.hypot(b.x - P.x, b.y - P.y) < 3500).length;
  if (near > (5 + sys.tier) * busy) return;
  // never near a friendly station, and never while you are in your undock grace
  if (P.grace > w.t) return;
  if (w.stations.some(s => s.team !== 'hostile' && Math.hypot(s.x - P.x, s.y - P.y) < s.r + SAFE_RADIUS)) return;
  const r = rng(hash(sys.seed, G.playTime | 0));
  const a = r() * TAU; const d = 1700 + r() * 600 + P.r * 3;
  const pool = ['redfang'].concat(sys.tier >= 2 ? ['vesh'] : [], sys.tier >= 3 ? ['lattice'] : [], sys.tier >= 4 ? ['ossari'] : [], sys.tier >= 5 ? ['kharr'] : []);
  const f = FACTIONS[sys.owner].hostile && r() < 0.5 ? sys.owner : r.pick(pool);
  const g = spawnGroup(w, { x: P.x + Math.cos(a) * d, y: P.y + Math.sin(a) * d }, f, sys.tier, r);
  for (const s of g) { handleEvent(app.fx, { t: 'shielddown', x: s.x, y: s.y, r: s.r }, { isPlayer: () => false }); }
  toast(`${FACTIONS[f].name} ${g.length > 1 ? `— ${g.length} ships` : '— a big one'} incoming`, 'bad');
  play('warn');
}

// ion storms in nebula systems: lightning across the sky, and shields will not recharge until it passes
function weather(dt) {
  const w = app.w, P = app.P; if (!w.system?.nebula) return;
  app.stormT = (app.stormT ?? 60 + Math.random() * 60) - dt;
  if (!w.storm && app.stormT <= 0) { w.storm = true; app.stormT = 25; banner('Ion storm', 'Shields will not recharge until it passes.'); play('warn'); }
  else if (w.storm && app.stormT <= 0) { w.storm = false; app.stormT = 90 + Math.random() * 90; toast('The ion storm has passed.', 'good'); }
  if (w.storm && Math.random() < dt * 1.5) {
    const a = Math.random() * TAU, d = 300 + Math.random() * 900; const x = P.x + Math.cos(a) * d, y = P.y + Math.sin(a) * d;
    handleEvent(app.fx, { t: 'arc', pts: [[x, y], [x + (Math.random() - 0.5) * 600, y + (Math.random() - 0.5) * 600]], color: '#b8a0ff', big: true }, { isPlayer: () => false });
    play('arc', x, y, camAudio(), 0.5); app.fx.flash = Math.max(app.fx.flash, 0.06); app.fx.flashColor = [0.7, 0.6, 1];
  }
}

/** Launch every drone fitted to your drone ports (play-test #28/#31: drones are items you fit in build mode). */
function launchWing(w, P) {
  const G = app.G; app.droneDown = new Map();
  const list = fittedDrones(G, P.stats.droneCap);
  list.forEach((d, i) => launchDrone(w, P, d.kind, i, d));
  if (list.length) G.stats.drones = Math.max(G.stats.drones || 0, list.length);
}
// a destroyed drone is never lost (owner #28): its port builds it again, free, after a short wait
function droneUpkeep(dt) {
  const G = app.G, P = app.P, w = app.w;
  app.droneT = (app.droneT || 0) - dt; if (app.droneT > 0) return; app.droneT = 1;
  const list = fittedDrones(G, P.stats.droneCap); if (!list.length) return;
  const alive = new Set(w.drones.filter(d => !d.dead && d.owner === P).map(d => d.uid));
  app.droneDown ||= new Map();
  list.forEach((d, i) => {
    if (alive.has(d.uid)) { app.droneDown.delete(d.uid); return; }
    const since = app.droneDown.get(d.uid); if (since == null) { app.droneDown.set(d.uid, w.t); return; }
    if (w.t - since >= DRONE_RESPAWN) { app.droneDown.delete(d.uid); launchDrone(w, P, d.kind, i, d); }
  });
}
const DRONE_RESPAWN = 12;
/** After you change which drones fly (hold → Drones, report #53): recall the ones taken off, launch the new ones now. */
app.refreshDrones = () => {
  const G = app.G, P = app.P, w = app.w; if (!G || !P || !w || P.dead || app.mode === 'docked') return;
  const list = fittedDrones(G, P.stats.droneCap); const want = new Set(list.map(d => d.uid));
  for (const d of w.drones) if (d.owner === P && !d.dead && !want.has(d.uid)) { d.dead = true; w.events.push({ t: 'launch', x: d.x, y: d.y, color: d.def.color }); }
  const alive = new Set(w.drones.filter(d => !d.dead && d.owner === P).map(d => d.uid));
  list.forEach((d, i) => { if (!alive.has(d.uid) && !app.droneDown?.has(d.uid)) launchDrone(w, P, d.kind, i, d); });   // a shot-down one still waits for its port
  for (const d of w.drones) if (d.owner === P && !d.dead) { const i = list.findIndex(x => x.uid === d.uid); if (i >= 0) d.slot = i; }
};

// ------------------------------------------------------------------ interact (dock, beacons, derelicts)
// (Mining claims were taken out 2026-11-12, owner report #64: rich fields are just rich asteroids to mine; old
// saves keep G.claims, which nothing reads any more.)
function nearestInteract() {
  const w = app.w, P = app.P; if (!P) return null;
  for (const s of w.stations || []) if (!s.dead && s.dockable && s.team !== 'hostile' && Math.hypot(s.x - P.x, s.y - P.y) < s.r + 260 + P.r) return { kind: 'dock', s, label: `Dock at ${s.name}` };
  { const ex = app.encInteract?.(); if (ex) return ex; }   // [encounters] outposts, merchants, caches, vaults, ruins (sim/encounters.js)
  for (const p of w.poi || []) {
    const d = Math.hypot(p.x - P.x, p.y - P.y);
    if (p.kind === 'beacon' && !p.done && d < 320 + P.r) return { kind: 'beacon', p, label: 'Answer the distress call' };
    if (p.kind === 'derelict' && !p.done && p.body && !p.body.dead && Math.hypot(p.body.x - P.x, p.body.y - P.y) < p.body.r + 200 + P.r) return { kind: 'derelict', p, label: 'Search the derelict' };
  }
  return planetInteract(app);   // [outpost] "Found an outpost" over a planet, else null
}
function prompts() {
  const it = nearestInteract(); const pr = $('#prompt');
  // Only touch the DOM when the words change: rewriting a button's text every frame replaces the node
  // under the finger, and iPhone Safari then drops the tap (the Dock button could not be pressed).
  if (it) { const t = `${app.input.device === 'pad' ? 'Y' : app.input.device === 'touch' ? '' : 'E'} — ${it.label}`.replace(/^ — /, ''); if (pr.textContent !== t) pr.textContent = t; pr.classList.remove('hidden'); }
  else pr.classList.add('hidden');
}
function interact() {
  const it = nearestInteract(); if (!it) return;
  const G = app.G, w = app.w, P = app.P;
  if (it.kind === 'dock') { if (w.t - app.combatOK() < 4) { toast('Cannot dock under fire.', 'bad'); return; } dockAt(it.s); }
  else if (it.kind === 'enc') it.run();   // [encounters]
  else if (it.kind === 'beacon') {
    it.p.done = true; sysMem(G, G.system).looted.push('beacon');
    const r = rng(hash(G.seed, G.system, 'beacon', G.playTime | 0));
    if (it.p.trap) { banner('It was a trap!', 'Corsairs drop out of hiding.'); spawnGroup(w, { x: P.x + 600, y: P.y + 300 }, w.tier >= 4 ? r.pick(['redfang', 'lattice']) : 'redfang', w.tier, r, 'pack'); play('warn'); }
    else {
      banner('Distress beacon answered', 'Crew pods and salvage drift out to you.');
      for (let i = 0; i < 2; i++) spawnPickup(w, { kind: 'pod', n: 1 + r.int(0, 2) }, it.p.x, it.p.y, 0, 0, 80);
      const rar = rollRarity(r, w.tier, 1); const pool = ['shield_arc', 'harpoon', 'missile_rack', 'drone_bay', 'repair_bay', 'scanner', 'loot_magnet', 'jump_drive', 'arc_caster', 'cpu'];
      spawnPickup(w, { kind: 'item', item: makeItem(r, r.pick(pool), rar.id), rarity: rar.id }, it.p.x, it.p.y, 0, 0, 60);
      repChangeLocal('guild', 4);
    }
  } else if (it.kind === 'derelict') {
    it.p.done = true; sysMem(G, G.system).looted.push('derelict');
    const r = rng(hash(G.seed, G.system, 'derelict'));
    banner('Derelict searched', 'Its last cargo spills out. The hull can be cut for salvage.');
    const fake = { faction: it.p.body.fromFaction || 'guild', tier: w.tier + 1, cls: 'frigate', crew: 0, elite: true };
    for (const l of rollLoot(r, fake)) if (l.kind !== 'pod') spawnPickup(w, l, it.p.body.x, it.p.body.y, 0, 0, 160);
  } else if (it.kind === 'found') { import('./ui/colony.js').then(m => m.foundDialog(app, it.p)).catch(e => console.error(e));   // [outpost]
  }
}
/** Scan pulse (V): marks asteroids by ore type around you (sim/scan.js). */
function doScan() {
  const res = scanPulse(app.w, app.P);
  if (!res.ok) { toast(`Scanner recharging (${Math.ceil(res.wait)}s)`); return; }
  ring(app.fx, app.P.x, app.P.y, res.range, '#7af7ff', 1.1, 4); wave(app.fx, app.P.x, app.P.y, res.range * 0.6, 0.02, 0.9);
  play('lock');
  const ore = res.found.filter(f => f.type !== 'rock');
  toast(res.found.length ? `Scan (${km(res.range)}): ${scanSummary(res.found)}` : `Scan (${km(res.range)}): nothing new nearby`, ore.length ? 'good' : '', '#7af7ff');
  if (!app.P.stats.scanRange && !app.toldScanner) { app.toldScanner = true; setTimeout(() => toast('A Scanner part reaches much further. Outfitters sell them.'), 2500); }
}
function repChangeLocal(f, d) { const G = app.G; G.rep[f] = clamp((G.rep[f] ?? 0) + d, -100, 100); }

function useUtility() {
  const P = app.P; if (!P.stats.cloak) { toast('No utility fitted (cloak field).'); return; }
  if ((P.cloakCd || 0) > app.w.t) { toast('Cloak recharging…'); return; }
  P.cloak = P.stats.cloak; P.cloakCd = app.w.t + P.stats.cloak + 20; toast('Cloaked', 'good');
}

// ------------------------------------------------------------------ docking
function dockAt(st) {
  const G = app.G; app.mode = 'docked'; G.docked = st.id; G.lastStation = { system: G.system };
  // remember which side you came in from: undocking puts you back there (owner 2026-11-12), not always east
  if (app.P) G.dockAngle = Math.atan2(app.P.y - st.y, app.P.x - st.x);
  G.stats.docks++; play('dock');
  storeWing(app);   // [wing] wingmen's damage back into the hangar
  storeShip(G, app.P); save(G); updateQuest();
  // [outpost] your own outpost opens its management screen instead of a station's shops
  if (st.stationKind === 'colony') { import('./ui/colony.js').then(m => m.openColony(app, st, () => undock(st))).catch(e => { console.error(e); undock(st); }); return; }
  import('./ui/station.js').then(m => m.openStation(app, st, () => undock(st))).catch(e => { console.error(e); undock(st); });
}
function undock(st) {
  const G = app.G; G.docked = null; app.mode = 'fly';
  // the ship may have changed in the station (shipyard, outfitter, repairs)
  const old = app.P; const P = playerShip(G); const da = G.dockAngle ?? st.a;
  P.x = st.x + Math.cos(da) * (st.r + 160); P.y = st.y + Math.sin(da) * (st.r + 160); P.a = da;
  app.w.bodies = app.w.bodies.filter(b => b !== old); old.dead = true; app.R.forget(old.id);
  app.w.drones = app.w.drones.filter(d => d.owner !== old);
  app.w.bodies.push(P); app.w.player = P; app.P = P;
  // a few seconds of grace and a clear doorstep (play-test: "I exited a station and was immediately destroyed")
  P.grace = app.w.t + GRACE_SECONDS; clearDoorstep(app.w, st); app.w.combatT = -99;
  launchWing(app.w, P);
  spawnWing(app, { fresh: true });   // [wing] relaunch from the hangar records (repairs / new ships)
  save(G); updateQuest();
}
app.rebuildPlayer = () => { // after build mode out in space
  const G = app.G; const old = app.P; const P = playerShip(G); Object.assign(P, { x: old.x, y: old.y, vx: old.vx, vy: old.vy, a: old.a });
  app.w.bodies = app.w.bodies.filter(b => b !== old); old.dead = true; app.R.forget(old.id); app.w.drones = app.w.drones.filter(d => d.owner !== old);
  app.w.bodies.push(P); app.w.player = P; app.P = P;
  launchWing(app.w, P);
  spawnWing(app);   // [wing] wing slots follow the flagship's class
};

// ------------------------------------------------------------------ death (insurance — PLAN §0 #3)
function onPlayerDeath() {
  app.mode = 'dead'; app.deadT = 2.6; app.deathShown = false; app.G.stats.deaths++;
  play('warn');
}
function deathPanel() {
  const G = app.G;
  const rebuild = Math.min(rebuildCost(G), Math.floor(G.credits * 0.5));   // never more than half your money
  const lostShare = G.insured ? 0.25 : 0.5;
  modal('Ship destroyed', (m, close) => {
    m.append(el('p', {}, G.insured ? 'Your insurance covers the rebuild. You lose a quarter of your cargo.' : `No insurance. Rebuilding your ship costs ${fmt(rebuild)} credits and half your cargo is lost.`));
    m.append(el('p', { class: 'hint' }, 'You wake up at the last station you docked at, in the same design.'));
    m.append(btn('Respawn', () => {
      close();
      for (const k of Object.keys(G.cargo)) G.cargo[k] = Math.floor(G.cargo[k] * (1 - lostShare));
      for (const k of Object.keys(G.goods)) G.goods[k] = Math.floor(G.goods[k] * (1 - lostShare));
      if (!G.insured) G.credits = Math.max(0, G.credits - rebuild); else G.insured = false;
      // restore every block to full health
      for (const b of G.ship.grid.b) b[4] = 1e9;
      G.ship.crew = Math.max(2, Math.floor((G.ship.crew || 2) * 0.7));
      save(G);
      enterSystem(G.lastStation.system, 'dock');
    }, 'primary big'));
  }, { sticky: true });
}
export function rebuildCost(G) {
  let n = 0; for (const [id] of G.ship.grid.b) n += BLOCK_COST(id);
  return Math.round(n * 0.35);
}
const BLOCK_COST = id => (BLOCKS[id]?.cost?.cr || 0) + Object.entries(BLOCKS[id]?.cost?.mats || {}).reduce((s, [m, v]) => s + (MATERIALS[m]?.price || 5) * v, 0);
app.rebuildCost = rebuildCost;

// ------------------------------------------------------------------ jumping (galaxy map)
app.startJump = (toId) => {
  const G = app.G; if (app.mode !== 'fly') return;
  const to = app.galaxy.systems[toId];
  if (!canWarpTo(G, to)) { toast(`Your ${warpCore(G).name} cannot reach danger ${to.tier}. You need a ${coreFor(to.tier).name}.`, 'bad'); return; }
  app.mode = 'jumping'; app.jump = { to: toId, t: 0, from: G.system };
  play('jump'); toast(`Jump drive charging…`);
};
function jumpTick(dt) {
  const J = app.jump; J.t += dt; const P = app.P;
  // stretch of light + ripples while charging
  if (Math.random() < 0.5) app.fx.parts.push({ k: 'spark', x: P.x + (Math.random() - 0.5) * 2000, y: P.y + (Math.random() - 0.5) * 2000, vx: (P.x - app.cam.x) * 0, vy: 0, life: 0.3, age: 0, color: '#bfe0ff', w: 1.5, drag: 1 });
  if (J.t > 2.3 && !J.fired) { J.fired = true; app.fx.flash = 0.8; app.fx.flashColor = [0.7, 0.85, 1]; app.fx.waves.push({ x: P.x, y: P.y, maxR: 3000, strength: 0.06, life: 0.8, age: 0 }); }
  if (J.t > 2.6) { storeWing(app); storeShip(app.G, P); app.G.docked = null; enterSystem(J.to, 'jump', J.from); app.fx.flash = 0.5; app.fx.flashColor = [1, 0.85, 0.6]; save(app.G); updateQuest(); }
}

// ------------------------------------------------------------------ HUD
let hudT = 0;
function updateHud() {
  const G = app.G, P = app.P; if (!P) return;
  hudT -= 1; if (hudT > 0) return; hudT = 4;
  $('#st-credits').textContent = `${fmt(G.credits)} cr`;
  const st = P.stats;
  setBar('.bar.hull', st.hp / Math.max(1, st.maxHp), `Hull ${Math.round(st.hp)} / ${Math.round(st.maxHp)}`);
  const shMax = P.shields.reduce((s, x) => s + (x.b.alive ? x.max : 0), 0), shCur = P.shields.reduce((s, x) => s + (x.b.alive ? x.cur : 0), 0);
  $('.bar.shield').classList.toggle('hidden', shMax <= 0); setBar('.bar.shield', shMax ? shCur / shMax : 0, `Shield ${Math.round(shCur)}`);
  // report #60: an emptied booster is locked until 30% — the bar shows it (grey stripes, a mark at the 30% line)
  $('.bar.boost').classList.toggle('locked', !!P.boostLocked);
  setBar('.bar.boost', P.boostFuel ?? 1, P.boostLocked ? `Boost recharging ${Math.round((P.boostFuel ?? 0) * 100)}% / ${Math.round(BOOST_RELOCK * 100)}%` : 'Boost');
  const used = cargoUsed(G);
  const mini = [];
  if (G.unlocked.cargo) mini.push(`Cargo <b class="${used >= st.cargo ? 'bad' : ''}">${used}/${Math.floor(st.cargo)}</b>`);
  mini.push(`CPU <b class="${st.cpu > st.cpuCap ? 'bad' : ''}">${st.cpu}/${st.cpuCap}</b>`);
  mini.push(`Crew <b class="${P.crew < st.crewMin ? 'bad' : st.crewRatio < 1 ? 'warn' : ''}">${P.crew}/${st.crewCap}</b>${st.crewNeed > P.crew ? `<span class="hint"> need ${st.crewNeed}</span>` : ''}`);
  mini.push(`Power <b class="${st.powerOk ? '' : 'bad'}">${Math.round(st.power)}/${Math.round(st.powerUse)}</b>`);
  if (P.grace > app.w.t) mini.push(`<b class="good">Safe launch ${Math.ceil(P.grace - app.w.t)}s</b>`);
  else if (app.cruise && Math.hypot(P.vx, P.vy) > 40) mini.push('<b class="good">Cruise</b>');
  else if (app.w.t - app.combatOK() < 5) mini.push('<b class="bad">In combat</b>');
  if (P.stats.droneCap) mini.push(`Drones <b>${app.w.drones.filter(d => !d.dead && d.owner === P).length}/${P.stats.droneCap}</b>`);
  if (P.repairStarved) mini.push('<b class="bad">Repairs need structural ore</b>');
  if (app.hudWing) mini.push(app.hudWing); if (app.hudRaid) mini.push(app.hudRaid);   // [wing] [outpost]
  const ms = $('#mini-stats'), mh = mini.join(' '); if (ms.dataset.h !== mh) { ms.innerHTML = mh; ms.dataset.h = mh; }
  // target panel: the locked/hovered ship
  const T = app.lock && !app.lock.dead ? app.lock : null; const tp = $('#target');
  if (T && T.kind !== 'rock') {
    const F = FACTIONS[T.faction];
    const tShield = T.shields?.reduce((s, x) => s + (x.b.alive ? x.cur : 0), 0) || 0;
    const scanned = P.stats.scan > 0;
    const res = scanned ? resistOf(T) : null;
    tp.innerHTML = `<h4 style="color:${F?.color || '#fff'}">${T.name || 'Unknown'}${T.boss ? ' ☠' : T.elite ? ' ★' : ''}</h4>
      <div class="hint">${F?.short || ''} ${CLASSES[T.cls]?.name || ''} · ${T.stats.blocks} blocks</div>
      <div>Hull ${Math.round(T.stats.hp / T.stats.maxHp * 100)}%${tShield ? ` · Shield ${Math.round(tShield)}` : ''}</div>
      ${res ? `<div class="res">${DAMAGE_IDS.map(d => `<span style="color:${DAMAGE[d].color}">${DAMAGE[d].short}<br>${res[d] > 0 ? '-' : '+'}${Math.abs(Math.round(res[d] * 100))}%</span>`).join('')}</div>` : '<div class="hint">Fit a scanner to read its armour.</div>'}`;
    tp.classList.remove('hidden');
  } else tp.classList.add('hidden');
  drawMinimap($('#minimap'), app);
  // low orbit readout (PLAN §0 #2): hovering over a planet
  const over = app.w.planets.find(p => Math.hypot(p.x - P.x, p.y - P.y) < p.r);
  const sysEl = $('#st-system'); const base = `${app.w.system.name} · Danger ${app.w.tier}`;
  const txt = over ? `Low orbit · ${over.name}` : base; if (sysEl.textContent !== txt) sysEl.textContent = txt;
  // touch controls
  const touch = app.input.device === 'touch' || (app.input.device === 'kb' && COARSE && !app.input.mouse.moved);
  $('#touch').classList.toggle('hidden', !touch);
  if (touch) {
    $('#touch [data-act=harpoon]').classList.toggle('hidden', !P.turrets.some(t => t.w.tool === 'harpoon'));
  }
}
function setBar(sel, k, label) { const b = $(sel); b.querySelector('i').style.transform = `scaleX(${clamp(k, 0, 1)})`; b.querySelector('span').textContent = label; }
/** Average armour resistance of a ship's outer blocks (what a scan shows). */
export function resistOf(s) {
  const tot = Object.fromEntries(DAMAGE_IDS.map(d => [d, 0])); let n = 0;
  for (const b of s.grid.blocks) { if (!b.alive) continue; const a = ARMOR[b.def.armor] || ARMOR.frame; const k = b.def.size * b.def.size; for (const d of DAMAGE_IDS) tot[d] += (a.resist[d] || 0) * k; n += k; }
  for (const d of DAMAGE_IDS) tot[d] /= Math.max(1, n);
  return tot;
}

// overlay: missile lock reticle, off-screen arrows to points of interest, station names
function drawOverlay(c, o) {
  if (app.mode === 'title' || !app.P) return;
  const w = app.w, P = app.P;
  const T = app.lock;
  if (T && !T.dead) {
    const x = o.ox(T.x), y = o.oy(T.y), r = Math.max(18 * o.ok, T.r * o.oz * 1.1);
    const hasLock = P.turrets.some(t => t.w.mode === 'lock' && t.b.alive);
    c.strokeStyle = hasLock ? '#ff6a3a' : 'rgba(255,255,255,0.5)'; c.lineWidth = 2 * o.ok;
    const k = r * 0.35; const t = w.t * 2;
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4 + (hasLock ? t * 0.3 : 0); const cx = x + Math.cos(a) * r, cy = y + Math.sin(a) * r; c.beginPath(); c.moveTo(cx - Math.cos(a - 0.8) * k * 0.5, cy - Math.sin(a - 0.8) * k * 0.5); c.lineTo(cx, cy); c.lineTo(cx - Math.cos(a + 0.8) * k * 0.5, cy - Math.sin(a + 0.8) * k * 0.5); c.stroke(); }
  }
  // off-screen markers: station, POIs, boss
  const marks = [];
  for (const s of w.stations || []) if (!s.dead) marks.push({ x: s.x, y: s.y, color: s.team === 'hostile' ? '#ff5a6a' : '#5fd8ff', label: s.name });
  // a course that follows a job is drawn by ui/missions.js (on top, follows the job's stage, never "arrives")
  if (app.waypoint && !app.waypoint.mission) { if (Math.hypot(app.waypoint.x - P.x, app.waypoint.y - P.y) < 400) { app.waypoint = null; toast('You have arrived.'); } else marks.push({ x: app.waypoint.x, y: app.waypoint.y, color: '#ffd27a', label: `Course: ${app.waypoint.label}` }); }
  if (P.grace > w.t) { const k = Math.min(1, (P.grace - w.t) / 2); c.strokeStyle = `rgba(110,255,170,${0.25 + 0.35 * k})`; c.lineWidth = 2 * o.ok; c.setLineDash([6 * o.ok, 6 * o.ok]); c.beginPath(); c.arc(o.ox(P.x), o.oy(P.y), (P.r + 30) * o.oz, 0, 7); c.stroke(); c.setLineDash([]); }
  for (const p of w.poi || []) if (!p.done && !p.mission && !(p.body && p.body.dead)) marks.push({ x: p.body?.x ?? p.x, y: p.body?.y ?? p.y, color: p.color || (p.kind === 'boss' ? '#ff3b5c' : p.kind === 'beacon' ? '#ffc45a' : p.kind === 'claim' ? '#5fff9a' : p.kind === 'stronghold' ? '#ff5a6a' : '#c48cff'), label: p.label || (p.kind === 'boss' ? p.name : p.kind === 'beacon' ? 'Distress call' : p.kind === 'claim' ? 'Rich field' : p.kind === 'stronghold' ? 'Stronghold' : 'Derelict') });   // [encounters] POIs may carry their own colour + label
  c.font = `600 ${Math.round(11 * o.ok)}px Rajdhani, system-ui`; c.textAlign = 'center';
  // wingmen: their callsign and hull bar over the ship, in their emblem colour
  for (const b of w.bodies) {
    if (!b.wing || b.dead) continue;
    const m = (app.G.mercs || []).find(x => x.id === b.merc); const x = o.ox(b.x), y = o.oy(b.y) - b.r * o.oz - 10 * o.ok;
    if (x < -40 || y < -40 || x > o.ow + 40 || y > o.oh + 40) continue;
    const col = m?.color || '#6ff0d0'; const k = Math.max(0, Math.min(1, b.stats.hp / Math.max(1, b.stats.maxHp)));
    c.fillStyle = col; c.globalAlpha = 0.9; c.fillText(m?.callsign || b.name || 'Wingman', x, y);
    c.globalAlpha = 0.5; c.fillRect(x - 18 * o.ok, y + 3 * o.ok, 36 * o.ok, 3 * o.ok); c.globalAlpha = 1; c.fillStyle = k < 0.35 ? '#ff6a6a' : col; c.fillRect(x - 18 * o.ok, y + 3 * o.ok, 36 * o.ok * k, 3 * o.ok);
  }
  // scanned asteroids: their ore type under them while on screen (plain rock stays quiet)
  for (const b of w.bodies) {
    if (!b.scanned || b.dead || b.kind !== 'rock' || rockOre(b).type === 'rock') continue;   // what it really holds now (sim/scan.js)
    const x = o.ox(b.x), y = o.oy(b.y) + (b.r * o.oz) + 12 * o.ok; if (x < -50 || y < -50 || x > o.ow + 50 || y > o.oh + 50) continue;
    const L = scanLabel(b); c.fillStyle = L.color; c.globalAlpha = 0.85; c.fillText(L.label, x, y); c.globalAlpha = 1;
  }
  for (const m of marks) {
    const x = o.ox(m.x), y = o.oy(m.y);
    const pad = 30 * o.ok; const inside = x > pad && y > pad && x < o.ow - pad && y < o.oh - pad;
    if (inside) { c.fillStyle = m.color; c.globalAlpha = 0.7; c.fillText(m.label, x, y - 10 * o.ok); c.globalAlpha = 1; continue; }
    const cx = o.ow / 2, cy = o.oh / 2; const a = Math.atan2(y - cy, x - cx);
    const ex = clamp(cx + Math.cos(a) * o.ow, pad, o.ow - pad), ey = clamp(cy + Math.sin(a) * o.oh, pad + 50 * o.ok, o.oh - pad);
    const d = Math.hypot(m.x - P.x, m.y - P.y);
    c.save(); c.translate(ex, ey); c.rotate(a); c.fillStyle = m.color; c.beginPath(); c.moveTo(9 * o.ok, 0); c.lineTo(-5 * o.ok, -6 * o.ok); c.lineTo(-5 * o.ok, 6 * o.ok); c.fill(); c.restore();
    c.fillStyle = m.color; c.globalAlpha = 0.85; c.fillText(`${m.label} · ${Math.max(0.1, Math.round(d / 100) / 10)} km`, ex, ey - 10 * o.ok); c.globalAlpha = 1;
  }
  app.missionOverlay?.(c, o);   // job markers (ui/missions.js), on top of everything above
  // touch sticks
  const tL = app.input.touch.left, tR = app.input.touch.right;
  // #49: the right thumb aims where it rests — a firing ring big enough to show around the thumb
  if (tR) { const x = tR.x * o.ok, y = tR.y * o.ok, r = 36 * o.ok; c.strokeStyle = 'rgba(255,120,90,0.7)'; c.lineWidth = 2 * o.ok; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8); c.lineTo(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3); c.stroke(); } }
  for (const t of [tL]) if (t) { c.strokeStyle = 'rgba(95,216,255,0.4)'; c.lineWidth = 2 * o.ok; c.beginPath(); c.arc(t.x0 * o.ok, t.y0 * o.ok, 55 * o.ok, 0, 7); c.stroke(); c.fillStyle = 'rgba(95,216,255,0.35)'; const dx = clamp(t.x - t.x0, -55, 55), dy = clamp(t.y - t.y0, -55, 55); c.beginPath(); c.arc((t.x0 + dx) * o.ok, (t.y0 + dy) * o.ok, 22 * o.ok, 0, 7); c.fill(); }
}

// the "Dock at …" pill is a button too (it looked like one, and on a phone it is where the thumb goes)
{ const pr = $('#prompt'); const go = e => { e.preventDefault(); e.stopPropagation(); if (app.mode === 'fly') app.input.press('interact'); };
  pr.addEventListener('touchstart', go, { passive: false }); pr.addEventListener('click', go); }
// the stats under the bars open the hold on the cargo tab (where your cargo list lives)
{ const ms = $('#mini-stats'); const go = e => { e.preventDefault(); e.stopPropagation(); if (app.mode === 'fly') openHold('cargo'); };
  ms.addEventListener('touchstart', go, { passive: false }); ms.addEventListener('click', go); }
// touch buttons
for (const b of document.querySelectorAll('#touch .tbtn')) {
  const act = b.dataset.act;
  if (b.dataset.hold) { b.addEventListener('touchstart', e => { app.input.hold(act, true); e.preventDefault(); }); b.addEventListener('touchend', () => app.input.hold(act, false)); }
  else b.addEventListener('touchstart', e => { app.input.press(act); e.preventDefault(); });
}

// ------------------------------------------------------------------ menus
$('#btn-menu').addEventListener('click', () => openMenu());
function closeTopPanel() { const p = $('#panels'); const last = p.lastElementChild; if (!last) return; last.querySelector('.panel-head button.primary')?.click() ?? last.remove(); if (p.lastElementChild === last) last.remove(); }
function openMenu() {
  modal('Menu', (m, close) => {
    const G = app.G;
    const add = (label, fn, cls) => m.append(btn(label, () => { close(); fn(); }, cls));
    add('Resume', () => {}, 'primary');
    if (G.unlocked.build) add('Build mode (B)', openBuild);
    add('Parts hold, cargo & drones', () => openHold());
    if (app.P?.stats.fab) add('Fabricator (craft from ore)', () => import('./ui/workshop.js').then(m => m.openFabricator(app)));
    add('Ship upgrades', () => import('./ui/upgrades.js').then(m => m.openUpgrades(app)));
    add('Local map (N)', openLocal);
    if (G.unlocked.galaxy) add('Star map (M)', openMap);
    add('Goals', openQuests);
    add('Settings', settingsDialog);
    add('Controls', controlsDialog);
    if (app.news) add("What's new", () => app.news.open());
    if (app.credits) add('Credits', () => app.credits.open());
    add('Report a bug', reportDialog);
    add('Save game', () => { storeShip(G, app.P); toast(save(G) ? 'Saved.' : 'Could not save (storage full or blocked).', 'good'); });
    add('Save and quit to title', () => { storeShip(G, app.P); save(G); app.G = null; app.P = null; showTitle(); }, 'danger');
  });
}
function settingsDialog() {
  modal('Settings', (m, close) => {
    const s = app.settings;
    const vol = el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.volume, oninput: e => { s.volume = +e.target.value; setVolume(s.volume); saveSettings(); } });
    const mute = el('input', { type: 'checkbox', checked: s.muted, onchange: e => { s.muted = e.target.checked; setMuted(s.muted); saveSettings(); } });
    const q = el('select', { onchange: e => { s.quality = +e.target.value; app.R.quality = s.quality; app.fx.quality = s.quality >= 1 ? 1 : 0.5; app.R.W = 0; saveSettings(); } },
      el('option', { value: 1, selected: s.quality >= 1 }, 'High (bloom, full particles)'), el('option', { value: 0.5, selected: s.quality < 1 }, 'Phone saver (fewer particles, lower resolution)'));
    m.append(el('label', {}, 'Volume', vol), el('label', { class: 'row' }, mute, ' Mute everything'), el('label', {}, 'Graphics ', q), btn('Done', close, 'primary'));
  });
}
function controlsDialog() {
  modal('Controls', (m, close) => {
    m.append(el('div', { class: 'kv', html: [
      ['Fly', 'W A S D / left stick / left thumb'], ['Aim', 'Mouse / right stick / right thumb'], ['Fire manual weapons + mining lasers', 'Left mouse / RT / hold right thumb where you want to shoot'],
      ['Missiles at the marked target', 'Right mouse / LT / by themselves on a phone'], ['Boost', 'Space or Shift / A'], ['Harpoon (again to let go)', 'F / X'], ['Reel the harpoon in', 'hold R / RB'],
      ['Dock / use', 'E / Y'], ['Scan for ore', 'V / D-pad right'], ['Cloak', 'Q / LB'], ['Build mode', 'B / B button'], ['Local map (also: tap the radar)', 'N / D-pad left'], ['Star map', 'M / Back'], ['Goals', 'J or Tab'], ['Drones', 'C / D-pad down'], ['Cargo hold', 'I'], ['Zoom', 'Mouse wheel'], ['Menu', 'Esc / Start'],
    ].map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('') }), el('p', { class: 'hint' }, 'Turrets aim and fire on their own. Your ship\'s nose follows the way you fly, so fixed forward guns point where you travel. Press a menu\'s key again to close it.'), btn('Done', close, 'primary'));
  });
}
function reportDialog() {
  modal('Report a bug', (m, close) => {
    const text = el('textarea', { rows: 5, placeholder: 'What went wrong, or what would you like? Plain words are perfect.' });
    m.append(text, el('p', { class: 'hint' }, 'Your note, a picture of the screen and a few game details are sent to the developer.'),
      el('div', { class: 'row end' }, btn('Cancel', close), btn('Send', async () => {
        if (!text.value.trim()) { toast('Write a few words first.', 'bad'); return; }
        let shot = null; try { shot = view.toDataURL('image/jpeg', 0.5); if (shot.length > 400000) shot = null; } catch { /* */ }
        const rep = { at: new Date().toISOString(), text: text.value, state: window.gameEye.state(), ua: navigator.userAgent, size: [innerWidth, innerHeight], build: BUILD, shot };
        close(); sendReport(rep);
      }, 'primary')));
    setTimeout(() => text.focus(), 30);
  });
}
// Reports: on the LAN to the dev server's inbox (tools/serve.py POST /api/inbox/<name>), anywhere else to
// games.radgh.com's report inbox (rgs-api POST /api/report/voidwright) — a relative link, so it also works
// from GitHub Pages, which lives under /Game-Playground/.
const REPORT_LAN = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
const REPORT_URL = REPORT_LAN ? new URL('../../../api/inbox/voidwright-report', import.meta.url) : 'https://games.radgh.com/api/report/voidwright';
async function sendReport(rep) {
  let list = []; try { list = JSON.parse(localStorage.getItem('voidwright.reports') || '[]'); } catch { /* */ }
  list.push(rep);
  const out = [];
  for (const r of list) {
    try { const res = await fetch(REPORT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r) }); if (!res.ok) out.push(r); } catch { out.push(r); }
  }
  try { localStorage.setItem('voidwright.reports', JSON.stringify(out.slice(-10))); } catch { /* */ }
  toast('Thank you — report sent.', 'good');
}
function openBuild() {
  const G = app.G;
  if (!G.unlocked.build) { toast('Build mode unlocks as you progress (see Goals).'); return; }
  if (app.mode !== 'fly' && app.mode !== 'docked') return;
  if (app.mode === 'fly' && app.w.t - app.combatOK() < 5) { toast('Too hot — get out of combat to rebuild.', 'bad'); return; }
  import('./ui/build.js').then(m => m.openBuild(app, { docked: app.mode === 'docked' })).catch(e => console.error(e));
}
// combat = a real exchange with an enemy (world.js noteCombat). Bumps, rocks and stray shots no longer count.
app.combatOK = () => app.w?.combatT ?? -99;
app.openBuild = openBuild;
function openMap() {
  if (!app.G.unlocked.galaxy) { const ch = CHAPTERS.find(c => c.unlock.includes('galaxy')); toast(`The star map opens when you finish the goal "${ch?.title || 'ahead'}".`); return; }
  import('./ui/galaxy.js').then(m => { m.openGalaxy(app); tagPanel('map'); }).catch(e => console.error(e));
}
function openLocal() {
  if (app.mode !== 'fly' || !app.P) return;
  import('./ui/localmap.js').then(m => { m.openLocalMap(app); tagPanel('local'); }).catch(e => console.error(e));
}
/** Remember which hotkey opened the panel on top, so the same key closes it (report #51). */
function tagPanel(key) { const top = $('#panels').lastElementChild; if (top?.classList.contains('panel-full') && !top.dataset.key) top.dataset.key = key; }
/** Which hotkey opens what: the key that opened the top panel closes it; another of these keys swaps to its panel. */
const PANEL_KEYS = { map: () => openMap(), local: () => openLocal(), quests: () => openQuests(), drones: () => openHold('drones'), hold: () => openHold('cargo') };
const HOLD_TAB = { drones: 'drones', hold: 'cargo' };
function panelKeys(raw) {
  const top = $('#panels').lastElementChild; const key = top?.dataset.key; if (!key) return;
  // in menus the controller's D-pad moves the focus (ui/padnav.js), so only Back (star map) toggles from a pad
  const pressed = Object.keys(PANEL_KEYS).find(k => raw[k + 'Pressed'] && (raw.device !== 'pad' || k === 'map'));
  if (!pressed) return;
  for (const k of Object.keys(PANEL_KEYS)) raw[k + 'Pressed'] = false;
  if (HOLD_TAB[key] && HOLD_TAB[pressed] && pressed !== key && top.showTab) { top.showTab(HOLD_TAB[pressed]); top.dataset.key = pressed; return; }
  closeTopPanel();
  if (pressed !== key) PANEL_KEYS[pressed]();
}
app.openLocal = openLocal;
$('#minimap').addEventListener('click', () => openLocal());
$('#minimap').addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); openLocal(); }, { passive: false });

/**
 * Phone auto-missiles (report #49): the target under your thumb if you are holding one, else the nearest enemy
 * ship or station within reach of your missile racks. Nothing during safe launch (firing would end it).
 */
function touchMissiles(w, P, held) {
  const racks = P.turrets.filter(t => t.w.mode === 'lock' && t.b.alive); if (!racks.length || P.grace > w.t) return null;
  const reach = Math.max(...racks.map(t => t.w.range || 900));
  if (held && Math.hypot(held.x - P.x, held.y - P.y) - held.r < reach) return held;
  let best = null, bd = reach;
  for (const s of w.bodies) {
    if (s.dead || (s.kind !== 'ship' && s.kind !== 'station' && s.kind !== 'ground') || !hostile(w, P, s) || s.cloak > 0) continue;
    const d = Math.hypot(s.x - P.x, s.y - P.y) - s.r; if (d < bd) { bd = d; best = s; }
  }
  return best;
}

/** Out of combat, nothing hostile close, and you are flying somewhere: cruise. */
function cruiseOK() {
  const w = app.w, P = app.P;
  if (w.t - app.combatOK() < 6) return false;
  for (const b of w.bodies) if (b.kind === 'ship' && !b.dead && hostile(w, b, P) && Math.hypot(b.x - P.x, b.y - P.y) < 2200) return false;
  return true;
}

/** Fill in the sectors around you as you fly; let go of the far ones (sim/sectors.js). */
function stream(dt) {
  app.streamT = (app.streamT || 0) - dt; if (app.streamT > 0) return; app.streamT = 0.25;
  streamSectors(app.w, app.P.x, app.P.y);
  app.pruneT = (app.pruneT || 0) - 0.25; if (app.pruneT <= 0) { app.pruneT = 10; app.R.prune?.(app.w); }
}

/** Hostile ships parked at a friendly station's door are moved off it. */
function clearDoorstep(w, st) {
  if (!st || st.team === 'hostile') return;
  for (const b of w.bodies) {
    if (b.dead || b.kind !== 'ship' || b.team !== 'hostile') continue;
    const dx = b.x - st.x, dy = b.y - st.y; const d = Math.hypot(dx, dy) || 1;
    const want = st.r + SAFE_RADIUS;
    if (d < want) { b.x = st.x + dx / d * (want + 400); b.y = st.y + dy / d * (want + 400); if (b.ai) b.ai.target = null; }
  }
  // and any shots already in the air near the door fizzle
  for (const p of w.shots) if (p.team !== 'player' && Math.hypot(p.x - st.x, p.y - st.y) < st.r + SAFE_RADIUS) p.dead = true;
}

function openQuests() { import('./ui/quests-ui.js').then(m => { m.openQuests(app); tagPanel('quests'); }).catch(e => console.error(e)); }
function openHold(tab) { import('./ui/hold.js').then(m => { m.openHold(app, tab); tagPanel(tab === 'drones' ? 'drones' : 'hold'); }).catch(e => console.error(e)); }
app.openHold = openHold; app.openMap = openMap; app.updateQuest = updateQuest; app.save = () => { if (app.P && app.mode !== 'docked') storeShip(app.G, app.P); return save(app.G); };
app.toast = toast; app.banner = banner;
app.dockAt = dockAt;   // [encounters] friendly outposts dock through the same path
// [encounters] missions, encounters, outposts and galaxy events hook in here (sets app.encTick / encNote / encInteract / encOverlay)
import('./ui/missions.js').then(m => m.initExpansion(app)).catch(e => console.error(e));

// ------------------------------------------------------------------ for Claude's game-eye and tests
window.gameEye = {
  state() {
    const G = app.G, P = app.P, w = app.w;
    return {
      mode: app.mode, build: BUILD,
      player: P ? { x: Math.round(P.x), y: Math.round(P.y), hp: Math.round(P.stats.hp), maxHp: Math.round(P.stats.maxHp), blocks: P.stats.blocks, cls: P.cls, dead: P.dead, speed: Math.round(Math.hypot(P.vx, P.vy)), turrets: P.turrets.length } : null,
      game: G ? { credits: G.credits, cargo: G.cargo, parts: G.parts.length, chapter: G.quest.chapter, unlocked: Object.keys(G.unlocked), system: G.system, tier: w?.tier, stats: G.stats } : null,
      world: w ? { size: w.size, sectors: w.sectors?.loaded.size || 0, grace: P ? Math.max(0, +(P.grace - w.t || 0).toFixed(1)) : 0, combat: +(w.t - (w.combatT ?? -99)).toFixed(1), drive: G?.drive || 1, bodies: w.bodies.length, ships: w.bodies.filter(b => b.kind === 'ship').length, hostiles: w.bodies.filter(b => b.kind === 'ship' && b.team === 'hostile').length, shots: w.shots.length, pickups: w.pickups.length, drones: w.drones.length, parts: app.fx.parts.length } : null,
      panels: [...$('#panels').children].map(p => p.querySelector('h2')?.textContent),
    };
  },
  health() { return { fps: Math.round(1 / Math.max(0.001, app.lastDt || 0.016)) }; },
};

// controller in menus: whenever flight does not own the pad (title, docked, any open panel)
import('./ui/padnav.js').then(({ createPadNav }) => {
  app.makePadNav = () => createPadNav({
    busy: () => (app.mode === 'fly' && !$('#panels').children.length) || !!app.buildUI,
    back: () => { if ($('#panels').children.length) { closeTopPanel(); return true; } return false; },
  });
  app.padnav = app.makePadNav();
}).catch(e => console.info('[voidwright] pad menus unavailable', e?.message));

// cloud saves while signed in to games.radgh.com (saves stay per game)
import('../../../shared/rgs-cloudsave.js').then(({ cloudSave }) => {
  app.cloud = cloudSave({ game: 'voidwright', keys: { prefs: 'voidwright.prefs', last: 'voidwright.last' }, prefixes: { slots: 'voidwright.slot.' },
    canRestore: () => app.mode === 'title', onRestore: () => location.reload() });
}).catch(e => console.info('[voidwright] cloud saves unavailable', e?.message));

showTitle();
requestAnimationFrame(loop);
