// Bannerline entry point (stream B). Boots data + renderer, runs the title -> match -> results flow.
//
// Query params (debug / tests):
//   ?speed=8        sim speed multiplier (also on the title's Speed chips)
//   ?autostart=1    skip the title and start a match with the saved / default setup
//   ?seed=123       match seed (default: random per match)
//   ?hero=warrior&race=freeholds&ai=recruit
//
// window.bannerline exposes { sim, clock, seat, hud, bar, start(), state() } for Playwright.

import { createRenderer } from './view/renderer.js';
import { createRtsCamera } from './view/camera.js';
import { buildWorld } from './view/terrain.js';
import { layoutFromMap } from './view/layout.js';
import { createActors } from './view/actors.js';
import { createFx } from './view/fx.js';
import { createNumbers } from './view/numbers.js';
import { loadBindings } from './input/bindings.js';
import { createDeviceManager } from './input/devices.js';
import { createSeat } from './input/commands.js';
import { createLocalClock } from './clock.js';
import { createTitle } from './ui/title.js';
import { createHud } from './ui/hud.js';
import { createControlBar } from './ui/controlbar.js';
import { showResults } from './ui/results.js';
import { createShop } from './ui/shop.js';
import { installTooltips } from '../../../shared/tooltip.js';
import { createSim, TICK_MS } from './sim/sim.js';
import { loadData } from './sim/data.js';
import { buildMap } from './sim/map.js';
import * as Q from './sim/query.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const bootEl = $('boot');

const app = {
  data: null, gfx: null, devices: null, camera: null, viewport: null,
  world: null, worldKey: '', mode: 'boot',
  match: null,                // { sim, clock, seat, actors, fx, numbers, hud, bar, player, ... }
};
window.bannerline = app;

async function boot() {
  const [data] = await Promise.all([
    loadData((name) => fetch(`data/${name}`).then((r) => { if (!r.ok) throw new Error(`data/${name}: ${r.status}`); return r.text(); })),
    loadBindings(),
  ]);
  app.data = data;
  installTooltips();

  const canvas = $('view');
  app.gfx = createRenderer(canvas);
  app.camera = createRtsCamera();
  const vp = {
    id: 'p0', camera: app.camera.camera, rect: { x: 0, y: 0, w: 1, h: 1 },
    layout(size) { this.rect = { x: 0, y: 0, w: size.w, h: size.h }; },
  };
  app.viewport = app.gfx.addViewport(vp);
  app.devices = createDeviceManager({ root: $('app') });

  // Title backdrop: the 1v1 vale, slowly flown over.
  ensureWorld(buildMap(data, 'vale', '1v1'));
  const f0 = app.layout.fields[0];
  app.camera.setBounds({ x0: -1e9, x1: 1e9, z0: -1e9, z1: 1e9 });
  app.camera.snapTo((f0.x0 + f0.x1) / 2, (f0.zGate + f0.zKeep) / 2);

  app.title = createTitle({ screen: $('screen-title'), data, onStart: (choice) => startMatch(choice) });
  bootEl.classList.add('done');
  setTimeout(() => bootEl.remove(), 600);

  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    try { frame(dt); } catch (err) { console.error(err); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  if (params.get('autostart')) {
    const c = app.title.choice;
    startMatch({ ...c, hero: params.get('hero') || c.hero, race: params.get('race') || c.race, ai: params.get('ai') || c.ai, speed: Number(params.get('speed')) || c.speed });
  } else {
    app.mode = 'title';
    app.title.show();
  }
}

function ensureWorld(map) {
  const key = map.id + ':' + map.fields.length + ':' + map.width;
  if (app.world && app.worldKey === key) return;
  app.world?.dispose();
  app.layout = layoutFromMap(map);
  app.world = buildWorld(app.gfx.scene, app.layout);
  app.worldKey = key;
}

// ---------------------------------------------------------------- match

function startMatch(choice) {
  endMatch();
  const data = app.data;
  const seed = params.get('seed') ? Number(params.get('seed')) >>> 0 : ((Math.random() * 0xffffffff) >>> 0);
  const race = choice.race;
  const deck = data.races.races[race].units.slice(0, 4);
  const config = {
    seed, mode: '1v1', map: 'vale',
    players: [
      { team: 0, name: 'You', kind: 'human', race, hero: choice.hero, deck },
      { team: 1, name: (choice.ai || 'recruit').replace(/^./, (c) => c.toUpperCase()), kind: 'ai', ai: { difficulty: choice.ai || 'recruit' }, race, hero: choice.hero },
    ],
  };
  let sim;
  try { sim = createSim(config, data); } catch (err) {
    app.title.show();
    app.title.error?.(err.message);
    alertBoot(err.message);
    return;
  }
  const player = 0;
  ensureWorld(sim.map);
  const myTeam = sim.state.players[player].team;
  const myField = sim.map.fields.find((f) => f.team === myTeam);
  app.camera.setBounds({ x0: myField.x0 + 4, x1: myField.x1 - 4, z0: myField.z0 + 6, z1: myField.z1 - 8 });
  app.camera.snapTo(myField.spawn.x, myField.spawn.z - 10);
  app.camera.centre();

  const overlay = $('overlay');
  overlay.replaceChildren();
  const actors = createActors({ scene: app.gfx.scene, data, localTeam: myTeam });
  const fx = createFx({ scene: app.gfx.scene, actors, tickHz: data.econ?.clock?.tickHz || 20, data });
  const numbers = createNumbers(overlay);
  const clock = createLocalClock({ sim, tickMs: TICK_MS, speed: Number(params.get('speed')) || choice.speed || 1 });
  const project = (x, y, z) => app.camera.project(x, y, z, app.viewport.rect);
  const seat = createSeat({
    player, viewport: app.viewport, camera: app.camera, actors,
    getState: () => sim.state,
    onUi: (u) => onSeatUi(u),
  });
  app.devices.claim('kbm', player);

  const hudRoot = $('hud');
  const hud = createHud({
    root: hudRoot, overlay, sim, Q, player, seat, project,
    onPause: (v) => clock.setPaused(v),
    onSurrender: () => seat.issue({ type: 'surrender' }),
    onQuit: () => { endMatch(); app.mode = 'title'; app.title.show(); },
  });
  const bar = createControlBar({ root: hudRoot, sim, Q, player, seat, actors, minimapLayout: app.layout });
  const shop = createShop({ root: hudRoot, sim, Q, player, seat });
  bar.onGear(() => shop.toggle());
  bar.setCameraBox(() => cameraBox());
  bar.onMinimap(({ x, z, button }) => {
    if (button === 2) seat.issue({ type: 'move', x, z });
    else { app.camera.snapTo(x, z); app.camera.target.set(x, 0, z); freeCamera(); }
  });
  const targetHint = document.createElement('div');
  targetHint.className = 'target-hint'; targetHint.hidden = true; targetHint.textContent = 'Attack-move: left-click a spot or an enemy · Esc cancels';
  hudRoot.append(targetHint);

  const deathPos = new Map();
  app.match = { sim, clock, seat, actors, fx, numbers, hud, bar, shop, player, myTeam, myField, deathPos, overDelay: 1.6, targetHint, choice };
  app.mode = 'match';
  app.title.hide();
  $('screen-match').hidden = false;
  $('screen-results').hidden = true;
  hud.alert('Hold your field. Send units with Z X C V.', 'info', 3600);
}

function freeCamera() { /* the camera switches itself to free mode on pan; minimap jumps also free it */ app.camera.update(0, { pan: { x: 0.0001, y: 0 } }); }

function cameraBox() {
  const r = app.viewport.rect;
  const pts = [[0, 0], [r.w, 0], [r.w, r.h - 170], [0, r.h - 170]].map(([x, y]) => app.camera.groundAt(x, y, r));
  return pts.every(Boolean) ? pts : null;
}

function onSeatUi(u) {
  const m = app.match; if (!m) return;
  if (u.type === 'marker') {
    const p = app.camera.project(u.x, 0, u.z, app.viewport.rect);
    const el = document.createElement('div');
    el.className = 'marker ' + u.kind;
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    $('overlay').append(el);
    setTimeout(() => el.remove(), 520);
  } else if (u.type === 'select') {
    m.bar.select(u.id);
  } else if (u.type === 'pause') {
    if (!m.sim.over) m.hud.togglePause();
  } else if (u.type === 'shop') {
    m.shop.toggle();
  } else if (u.type === 'scoreboard') {
    m.hud.showBoard(!m.hud.boardOpen);
  }
}

function handleEvents(events, quiet = false) {
  const m = app.match;
  const s = m.sim.state;
  const myHero = s.players[m.player].heroEnt;
  for (const ev of events) {
    m.actors.onEvent(ev);
    if (quiet) { if (ev.type === 'result') m.hud.onEvent(ev); continue; }
    m.fx.onEvent(ev, s);
    m.hud.onEvent(ev);
    switch (ev.type) {
      case 'hit': {
        const a = m.actors.get(ev.dst); if (!a) break;
        const kind = ev.dst === myHero ? 'dmgTaken' : ev.crit ? 'crit' : 'dmg';
        const src = s.ents.find((e) => e.id === ev.src);
        // Unit-vs-unit chip damage stays quiet; the hero's hits and hits on the hero are loud.
        if (kind === 'dmg' && src && src.kind !== 'hero') break;
        m.numbers.spawn(a.x, a.height + 0.6, a.z, ev.amount, kind);
        if (ev.dst === myHero && ev.amount > 0.08 * (a.ent.hpMax || 1)) app.camera.kick(0.25);
        break;
      }
      case 'heal': {
        const a = m.actors.get(ev.dst);
        if (a && ev.amount >= 1 && (ev.dst === myHero || a.ent.kind === 'hero')) m.numbers.spawn(a.x, a.height + 0.6, a.z, '+' + Math.round(ev.amount), 'heal');
        break;
      }
      case 'death': m.deathPos.set(ev.id, { x: ev.x, z: ev.z }); break;
      case 'bounty': {
        if (ev.player !== m.player) break;
        const p = m.deathPos.get(ev.src) || (() => { const a = m.actors.get(ev.src); return a ? { x: a.x, z: a.z } : null; })();
        if (p) m.numbers.spawn(p.x, 1.6, p.z, `+${Math.round(ev.amount)}g`, 'gold');
        break;
      }
      case 'pay': {
        if (ev.player !== m.player) break;
        const a = m.actors.get(s.players[m.player].heroEnt);
        if (a) m.numbers.spawn(a.x, a.height + 1.2, a.z, `+${Math.round(ev.amount)} gold`, 'gold');
        break;
      }
      case 'wave': {
        const f = m.sim.map.fields[ev.field];
        if (f) m.fx.flare(f.gates[0].x, f.gates[0].z + 2, f.team === m.myTeam ? 0xff7a5a : 0x7ab0ff, 5);
        break;
      }
      case 'tide': {
        const f = m.sim.map.fields[ev.field];
        if (f) m.fx.flare(f.gates[0].x, f.gates[0].z + 2, 0xc8b48a, 5);
        break;
      }
      case 'leak': {
        if (ev.team === m.myTeam) app.camera.kick(0.35);
        break;
      }
      case 'levelUp': {
        const pl = s.players[ev.player];
        const a = m.actors.get(pl?.heroEnt);
        if (a) { m.numbers.spawn(a.x, a.height + 1.4, a.z, `Level ${ev.level}`, 'text'); m.fx.flare(a.x, a.z, 0xffe08a, 2.4); }
        break;
      }
      default: break;
    }
  }
  if (m.deathPos.size > 400) m.deathPos.clear();
}

function endMatch() {
  const m = app.match; if (!m) return;
  m.hud.destroy(); m.bar.destroy(); m.shop.destroy(); m.actors.dispose(); m.fx.dispose(); m.numbers.clear();
  m.targetHint.remove();
  app.devices.release(m.player);
  app.match = null;
  $('screen-match').hidden = true;
  $('overlay').replaceChildren();
  // Back to the title fly-over.
  app.camera.setBounds({ x0: -1e9, x1: 1e9, z0: -1e9, z1: 1e9 });
}

function frame(dt) {
  const frames = app.devices.poll();
  const m = app.match;
  if (app.world) app.world.update(dt);

  if (m) {
    const kbmFrame = frames.get('kbm');
    const intents = m.seat.update(app.devices.frameFor(m.player) || kbmFrame, dt);
    document.body.classList.toggle('targeting', m.seat.targeting === 'amove');
    m.targetHint.hidden = m.seat.targeting !== 'amove';
    if (intents.zoom) app.camera.zoomBy(intents.zoom);
    if (intents.centre) app.camera.centre();
    const s = m.sim.state;
    const heroA = m.actors.get(s.players[m.player].heroEnt);
    const heroAlive = heroA && heroA.ent.alive !== false;
    app.camera.update(dt, {
      follow: heroAlive ? { x: heroA.x, z: heroA.z } : { x: m.myField.spawn.x, z: m.myField.spawn.z - 8 },
      leadPoint: m.seat.ground,
      pan: intents.pan, drag: intents.drag, viewportH: app.viewport.rect.h,
    });
    const hudPaused = m.hud.paused;
    const events = m.clock.frame(dt * 1000, () => m.seat.take());
    if (events.length) handleEvents(events);
    m.actors.sync(s, m.clock.alpha, hudPaused ? 0 : dt);
    for (const t of s.teams) app.world.setBanners(t.id, t.bannersMax ? t.banners / t.bannersMax : 0);
    m.fx.update(hudPaused ? 0 : dt);
    m.hud.update(dt);
    m.bar.update(dt);
    m.shop.update(dt);
    m.numbers.update(dt, (x, y, z) => app.camera.project(x, y, z, app.viewport.rect));
    if (m.sim.over && !m.shown) {
      m.overDelay -= dt;
      if (m.overDelay <= 0) {
        m.shown = true;
        $('screen-results').hidden = false;
        showResults({
          card: $('results-card'), sim: m.sim, player: m.player,
          onAgain: () => { $('screen-results').hidden = true; startMatch(m.choice); },
          onTitle: () => { $('screen-results').hidden = true; endMatch(); app.mode = 'title'; app.title.show(); },
        });
      }
    }
  } else if (app.layout) {
    // Title: drift slowly up the first field and back.
    const f0 = app.layout.fields[0];
    const t = performance.now() / 1000;
    const z = (f0.zGate + f0.zKeep) / 2 + Math.sin(t * 0.08) * 40;
    const x = (f0.x0 + f0.x1) / 2 + Math.sin(t * 0.05) * 30 + 20;
    app.camera.update(dt, { follow: { x, z } });
  }
  app.gfx.render();
}

function alertBoot(msg) {
  const el = document.createElement('div');
  el.className = 'boot error'; el.textContent = 'Could not start the match:\n' + msg;
  el.addEventListener('click', () => el.remove());
  $('app').append(el);
}

app.start = (choice) => startMatch({ ...app.title.choice, ...choice });
app.state = () => app.match?.sim.state;
/** Test hook: run the sim forward `ticks` ticks right now (AI plays; the local hero gets no commands). */
app.fastForward = (ticks) => {
  const m = app.match; if (!m) return 0;
  let n = 0;
  while (n < ticks && !m.sim.over) { m.sim.step(m.seat.take()); handleEvents(m.sim.drainEvents(), true); n++; }
  return n;
};

boot().catch((err) => {
  console.error(err);
  bootEl.classList.add('error');
  bootEl.textContent = 'Bannerline failed to load:\n' + (err.stack || err.message);
});
