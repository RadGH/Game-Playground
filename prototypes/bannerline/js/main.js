// Bannerline entry point (stream B). Boots data + renderer and runs
//   title -> lobby -> match (1 or 2 local views, split screen) -> results -> lobby (slots kept).
//
// Query params (debug / tests):
//   ?speed=8        sim speed multiplier (overrides the lobby's Speed)
//   ?autostart=1    skip title + lobby: keyboard player vs a Recruit AI (also ?hero= ?race= ?ai= ?mode=)
//   ?seed=123       match seed (default: random per match)
//
// window.bannerline exposes { match, views, devices, session, lobby, start(), state(),
// fastForward(ticks), probe() } for Playwright.

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
import { createLobby, defaultSession, sessionToPlayers } from './ui/lobby.js';
import { createHud } from './ui/hud.js';
import { createControlBar } from './ui/controlbar.js';
import { createShop } from './ui/shop.js';
import { showResults } from './ui/results.js';
import { createSendPanel } from './ui/sendpanel.js';
import { createOnboarding, shouldOnboard } from './ui/onboarding.js';
import { createIconLibrary } from './view/icons.js';
import { installTooltips } from '../../../shared/tooltip.js';
import { createSim, TICK_MS } from './sim/sim.js';
import { loadData } from './sim/data.js';
import { buildMap } from './sim/map.js';
import * as Q from './sim/query.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const bootEl = $('boot');
const MAX_LOCAL = 2;

const app = {
  data: null, gfx: null, devices: null, screen: 'boot',
  flyCam: null, flyViewport: null,
  world: null, worldKey: '', layout: null,
  session: null, lobby: null, title: null,
  match: null,                // { sim, clock, actors, fx, views[], ... }
  results: null,
};
window.bannerline = app;

async function boot() {
  const [data] = await Promise.all([
    loadData((name) => fetch(`data/${name}`).then((r) => { if (!r.ok) throw new Error(`data/${name}: ${r.status}`); return r.text(); })),
    loadBindings(),
  ]);
  app.data = data;
  installTooltips();
  try { app.icons = await createIconLibrary(); } catch (err) { console.warn('icons unavailable', err); app.icons = null; }

  app.gfx = createRenderer($('view'));
  app.devices = createDeviceManager({ root: $('app') });
  app.flyCam = createRtsCamera();
  app.flyViewport = { id: 'fly', camera: app.flyCam.camera, rect: { x: 0, y: 0, w: 1, h: 1 }, layout(size) { this.rect = { x: 0, y: 0, w: size.w, h: size.h }; } };
  app.gfx.addViewport(app.flyViewport);

  // Backdrop: the 1v1 vale, slowly flown over.
  ensureWorld(buildMap(data, 'vale', '1v1'));

  app.session = defaultSession(data);
  app.title = createTitle({ screen: $('screen-title'), onPlay: () => showLobby() });
  app.lobby = createLobby({
    screen: $('screen-lobby'), data, devices: app.devices, session: app.session,
    onStart: (session) => startMatch(session),
    onBack: () => showTitle(),
  });
  // A controller that dropped out mid-match can take its seat back with A / Start.
  app.devices.onJoin((dev) => {
    if (app.screen !== 'match') return;
    const v = app.match?.views.find((x) => x.lost && (x.deviceType === dev.type));
    if (v) { v.device = dev.id; v.lost = false; app.devices.claim(dev.id, v.slotKey); v.hud.alert(`${dev.label} took over Player ${v.slotPlayer}`, 'good'); }
  });

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

  if (params.get('autostart')) app.start({});
  else showTitle();
}

function ensureWorld(map) {
  const key = map.id + ':' + map.fields.length + ':' + map.width;
  if (app.world && app.worldKey === key) return;
  app.world?.dispose();
  app.layout = layoutFromMap(map);
  app.world = buildWorld(app.gfx.scene, app.layout);
  app.worldKey = key;
}

function setScreen(name) {
  app.screen = name;
  $('screen-title').hidden = name !== 'title';
  $('screen-lobby').hidden = name !== 'lobby';
  $('screen-match').hidden = name !== 'match' && name !== 'results';
  $('screen-results').hidden = name !== 'results';
}
function showTitle() { endMatch(); app.lobby.hide(); setScreen('title'); app.title.show(); useFlyCam(); }
function showLobby() { endMatch(); app.title.hide(); setScreen('lobby'); app.lobby.show(); useFlyCam(); }
function useFlyCam() {
  if (!app.gfx.viewports.includes(app.flyViewport)) app.gfx.addViewport(app.flyViewport);
  app.flyCam.setBounds({ x0: -1e9, x1: 1e9, z0: -1e9, z1: 1e9 });
}

// ---------------------------------------------------------------- match

function startMatch(session) {
  endMatch();
  const data = app.data;
  const seed = params.get('seed') ? Number(params.get('seed')) >>> 0 : ((Math.random() * 0xffffffff) >>> 0);
  const { players, local } = sessionToPlayers(session, data);
  let sim;
  try { sim = createSim({ seed, mode: session.mode, map: session.map || 'vale', players }, data); } catch (err) {
    console.error(err);
    alertBoot(err.message);
    showLobby();
    return;
  }
  ensureWorld(sim.map);
  app.gfx.removeViewport(app.flyViewport);

  const firstTeam = local.length ? sim.state.players[local[0].player].team : 0;
  const actors = createActors({ scene: app.gfx.scene, data, localTeam: firstTeam });
  const fx = createFx({ scene: app.gfx.scene, actors, tickHz: data.econ?.clock?.tickHz || 20, data });
  const clock = createLocalClock({ sim, tickMs: TICK_MS, speed: Number(params.get('speed')) || session.speed || 1 });
  const m = { sim, clock, actors, fx, views: [], session, deathPos: new Map(), overDelay: 1.6, pausedBy: null, shown: false };
  app.match = m;

  const seats = local.slice(0, MAX_LOCAL);
  const host = $('screen-match');
  host.replaceChildren();
  seats.forEach((l, i) => m.views.push(makeView(m, i, seats.length, l, host)));

  setScreen('match');
  app.title.hide(); app.lobby.hide();
  for (const v of m.views) v.hud.alert(v.isPad ? 'Hold your field. LB + d-pad sends units.' : 'Hold your field. Send units with Z X C V.', 'info', 3600);
}

function makeView(m, i, n, l, host) {
  const { sim } = m;
  const data = app.data;
  const player = l.player;
  const slot = l.slot;
  const camera = createRtsCamera();
  const vp = {
    id: 'v' + i, camera: camera.camera, rect: { x: 0, y: 0, w: 1, h: 1 },
    layout(size) {
      const w = n === 1 ? size.w : Math.floor(size.w / n);
      this.rect = { x: i * w, y: 0, w: i === n - 1 ? size.w - w * i : w, h: size.h };
    },
  };
  app.gfx.addViewport(vp);
  const isPad = slot.deviceType === 'gamepad';
  const root = document.createElement('div');
  root.className = 'view-root' + (isPad ? ' pad-view' : ' kbm-view') + (n > 1 ? ' split' : '');
  root.dataset.view = String(i);
  root.style.setProperty('--seat', ['#f2c45a', '#7fd0ff'][i] || '#fff');
  const overlay = document.createElement('div'); overlay.className = 'overlay';
  const hudRoot = document.createElement('div'); hudRoot.className = 'hud';
  root.append(overlay, hudRoot);
  if (n > 1) { const tag = document.createElement('div'); tag.className = 'seat-tag'; tag.textContent = `Player ${slot.player}`; root.append(tag); }
  host.append(root);

  const myTeam = sim.state.players[player].team;
  const myField = sim.map.fields.find((f) => f.team === myTeam);
  // The camera may look anywhere on the map (owner: "there is no reason to prevent you from looking").
  const mb = app.layout.bounds;
  camera.setBounds({ x0: mb.x0 + 4, x1: mb.x1 - 4, z0: mb.z0 + 6, z1: mb.z1 - 8 });
  camera.snapTo(myField.spawn.x, myField.spawn.z - 10);

  const view = { i, player, slotKey: slot.key, slotPlayer: slot.player, device: slot.device, deviceType: slot.deviceType, isPad, lost: false,
    camera, vp, root, overlay, hudRoot, myTeam, myField, talentMode: false,
    hall: app.layout.fields.find((f) => f.team === myTeam)?.musterHall || null, nearHall: false, hallBy: null, lookIdx: 0 };
  const project = (x, y, z) => { const p = camera.project(x, y, z, vp.rect); p.x -= vp.rect.x; p.y -= vp.rect.y; return p; };
  view.project = project;
  view.numbers = createNumbers(overlay);
  view.seat = createSeat({
    player, device: slot.device, viewport: vp, camera, actors: m.actors,
    getState: () => sim.state, getData: () => data,
    onUi: (u) => onSeatUi(view, u),
  });
  view.hud = createHud({
    root: hudRoot, overlay, sim, Q, player, seat: view.seat, project, isPad,
    onPause: (v) => { m.clock.setPaused(v); m.pausedBy = v ? view : null; for (const o of m.views) o.root.classList.toggle('paused-other', v && o !== view); },
    onSurrender: () => view.seat.issue({ type: 'surrender' }),
    onQuit: () => showLobby(),
    onHowTo: () => view.onboarding.start(),
  });
  view.bar = createControlBar({ root: hudRoot, sim, Q, player, seat: view.seat, actors: m.actors, minimapLayout: app.layout });
  view.shop = createShop({ root: hudRoot, sim, Q, player, seat: view.seat, isPad });
  view.sendPanel = createSendPanel({
    root: hudRoot, sim, Q, player, seat: view.seat, isPad,
    iconUrl: (u) => app.icons?.url('unit', u) || null,
    onSend: ({ ok }) => sfx(ok ? 'send' : 'refuse'),
    onToast: (t) => view.hud.alert(t, 'info', 1600),
  });
  view.bar.onHall(() => toggleHall(view, 'button'), () => view.sendPanel.open);
  view.bar.onFavSend(() => sfx('send'));
  view.hud.onArmy(() => lookAtField(view, 1));
  const hallLabel = document.createElement('div');
  hallLabel.className = 'hall-label';
  hallLabel.innerHTML = `Muster Hall · send units ${isPad ? '<kbd class="pad">↓</kbd>' : '<kbd>B</kbd>'}`;
  overlay.append(hallLabel);
  view.hallLabel = hallLabel;
  view.onboarding = createOnboarding({ root: hudRoot, isPad });
  if (shouldOnboard()) view.onboarding.start();
  view.bar.onGear(() => { view.sendPanel.setOpen(false); view.shop.toggle(); });
  view.bar.onOil(() => view.shop.openOil());
  view.bar.setCameraBox(() => cameraBox(view));
  view.bar.onMinimap(({ x, z, button }) => {
    if (button === 2) view.seat.issue({ type: 'move', x, z });
    else camera.lookAt(x, z);
  });
  const targetHint = document.createElement('div');
  targetHint.className = 'target-hint'; targetHint.hidden = true; targetHint.textContent = 'Attack-move: left-click a spot or an enemy · Esc cancels';
  hudRoot.append(targetHint);
  view.targetHint = targetHint;
  if (isPad) {
    const pad = document.createElement('div');
    pad.className = 'pad-legend';
    pad.innerHTML = '<kbd class="pad">LB</kbd>+d-pad send · <kbd class="pad">View</kbd> armory · <kbd class="pad">LT</kbd>+skill learn · <kbd class="pad">Menu</kbd> pause';
    hudRoot.append(pad);
  }
  return view;
}

function cameraBox(view) {
  const r = view.vp.rect;
  const pts = [[0, 0], [r.w, 0], [r.w, r.h - 170], [0, r.h - 170]].map(([x, y]) => view.camera.groundAt(x, y, r));
  return pts.every(Boolean) ? pts : null;
}

function onSeatUi(view, u) {
  const m = app.match; if (!m) return;
  if (u.type === 'marker') {
    const p = view.project(u.x, 0, u.z);
    const el = document.createElement('div');
    el.className = 'marker ' + u.kind;
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    view.overlay.append(el);
    setTimeout(() => el.remove(), 520);
  } else if (u.type === 'select') {
    view.bar.select(u.id);
  } else if (u.type === 'cycleSelect') {
    const s = m.sim.state;
    const foes = s.ents.filter((e) => e.alive !== false && e.field === view.myField.id && e.team !== view.myTeam);
    const cur = foes.findIndex((e) => e.id === view.bar.selected);
    const next = foes[(cur + 1) % Math.max(1, foes.length)];
    view.bar.select(next ? next.id : -1);
  } else if (u.type === 'pause') {
    if (!m.sim.over && !m.pausedBy) view.hud.setPaused(true);
  } else if (u.type === 'scoreboard') {
    view.hud.showBoard(!view.hud.boardOpen);
  } else if (u.type === 'shop') {
    if (view.isPad && view.hud.talentOpen && !view.talentMode && !view.shop.open) view.talentMode = true;
    else { view.talentMode = false; view.sendPanel.setOpen(false); view.shop.toggle(); }
  } else if (u.type === 'oil') {
    if (view.shop.open) view.shop.setOpen(false); else view.shop.openOil();
  } else if (u.type === 'musterHall') {
    toggleHall(view, 'key');
  } else if (u.type === 'interact') {
    if (view.nearHall && !view.sendPanel.open) toggleHall(view, 'key');
  } else if (u.type === 'clickGround') {
    // Clicking the Muster Hall (anywhere on the building or its ring) opens the send panel.
    const hl = view.hall;
    if (hl && Math.hypot(u.x - hl.x, u.z - (hl.z + 1.5)) < 5.5) { toggleHall(view, 'click', true); return true; }
    return false;
  } else if (u.type === 'nextField') {
    lookAtField(view, (view.lookIdx + 1) % fieldOrder(view).length);
  } else if (u.type === 'sent') {
    sfx('send');
  } else if (u.type === 'autoToggled') {
    const me = m.sim.state.players[view.player];
    const unit = m.sim.data.units.units[me.deck[u.index]]?.name || 'send';
    view.hud.alert(`Auto-send ${me.auto[u.index] ? 'off' : 'on'}: ${unit}`, 'info', 1400);
  }
}

/** Open / close the Muster Hall send panel. `by` = 'walk' | 'key' | 'click' | 'button'. */
function toggleHall(view, by, forceOpen = false) {
  const open = forceOpen || !view.sendPanel.open;
  if (open) { view.shop.setOpen(false); view.hallBy = by; }
  view.sendPanel.setOpen(open);
  if (open) view.onboarding.did('openHall');
}

/** Fields in look order: yours first, then your rival's, then the rest. */
function fieldOrder(view) {
  const m = app.match;
  const rivalTeam = m.sim.state.players[m.sim.state.players[view.player].rival]?.team;
  const fs = m.sim.map.fields.slice();
  return [fs.find((f) => f.team === view.myTeam), fs.find((f) => f.team === rivalTeam), ...fs.filter((f) => f.team !== view.myTeam && f.team !== rivalTeam)].filter(Boolean);
}
/** Look at a field: index 0 = back to your hero (follow), 1 = your rival's field, ... */
function lookAtField(view, idx) {
  const order = fieldOrder(view);
  view.lookIdx = idx % order.length;
  if (view.lookIdx === 0) { view.camera.centre(); return; }
  const f = order[view.lookIdx];
  // Look at where the fighting is: the middle of your units in that field, else the field's middle.
  const s = app.match.sim.state;
  const mine = s.ents.filter((e) => e.kind === 'unit' && e.owner === view.player && e.field === f.id && e.alive !== false);
  const z = mine.length ? mine.reduce((a, e) => a + e.z, 0) / mine.length : (f.z0 + f.z1) / 2;
  view.camera.lookAt(f.cx ?? (f.x0 + f.x1) / 2, z);
  view.hud.alert(view.lookIdx === 1 ? `Watching your rival's field — ${view.isPad ? 'L3' : 'Space'} returns to your hero` : 'Watching another field', 'info', 1800);
}

/** Sound hook: the sound stream (sfx/) listens for `bannerline:sfx` events; nothing plays without it. */
function sfx(id, detail = {}) {
  try { window.dispatchEvent(new CustomEvent('bannerline:sfx', { detail: { id, ...detail } })); } catch { /* old browser */ }
}

function handleEvents(events, quiet = false) {
  const m = app.match;
  const s = m.sim.state;
  for (const ev of events) {
    m.actors.onEvent(ev);
    if (quiet) continue;
    m.fx.onEvent(ev, s);
    for (const v of m.views) v.hud.onEvent(ev);
    switch (ev.type) {
      case 'hit': {
        const a = m.actors.get(ev.dst); if (!a) break;
        const src = s.ents.find((e) => e.id === ev.src);
        for (const v of m.views) {
          const myHero = s.players[v.player].heroEnt;
          const kind = ev.dst === myHero ? 'dmgTaken' : ev.crit ? 'crit' : 'dmg';
          // Unit-vs-unit chip damage stays quiet; the hero's hits and hits on the hero are loud.
          if (kind === 'dmg' && src && src.kind !== 'hero') continue;
          v.numbers.spawn(a.x, a.height + 0.6, a.z, ev.amount, kind);
          if (ev.dst === myHero && ev.amount > 0.08 * (a.ent.hpMax || 1)) v.camera.kick(0.25);
        }
        break;
      }
      case 'heal': {
        const a = m.actors.get(ev.dst);
        if (a && ev.amount >= 1 && a.ent.kind === 'hero') for (const v of m.views) v.numbers.spawn(a.x, a.height + 0.6, a.z, '+' + Math.round(ev.amount), 'heal');
        break;
      }
      case 'death': m.deathPos.set(ev.id, { x: ev.x, z: ev.z }); break;
      case 'bounty': {
        const v = m.views.find((x) => x.player === ev.player); if (!v) break;
        const p = m.deathPos.get(ev.src) || (() => { const a = m.actors.get(ev.src); return a ? { x: a.x, z: a.z } : null; })();
        if (p) v.numbers.spawn(p.x, 1.6, p.z, `+${Math.round(ev.amount)}g`, 'gold');
        break;
      }
      case 'pay': {
        const v = m.views.find((x) => x.player === ev.player); if (!v) break;
        const a = m.actors.get(s.players[v.player].heroEnt);
        if (a) v.numbers.spawn(a.x, a.height + 1.2, a.z, `+${Math.round(ev.amount)} gold`, 'gold');
        break;
      }
      case 'wave': {
        const f = m.sim.map.fields[ev.field];
        if (f) m.fx.flare(f.gates[0].x, f.gates[0].z + 2, 0xff7a5a, 5);
        break;
      }
      case 'tide': {
        const f = m.sim.map.fields[ev.field];
        if (f) m.fx.flare(f.gates[0].x, f.gates[0].z + 2, 0xc8b48a, 5);
        break;
      }
      case 'leak': for (const v of m.views) if (ev.team === v.myTeam) v.camera.kick(0.35); break;
      case 'levelUp': {
        const pl = s.players[ev.player];
        const a = m.actors.get(pl?.heroEnt);
        if (a) { for (const v of m.views) v.numbers.spawn(a.x, a.height + 1.4, a.z, `Level ${ev.level}`, 'text'); m.fx.flare(a.x, a.z, 0xffe08a, 2.4); }
        break;
      }
      case 'queued': case 'sent': {
        const v = m.views.find((x) => x.player === ev.player); if (!v) break;
        const info = Q.sendInfo(s, m.sim.data, ev.player, ev.unit);
        if (info?.income) v.hud.sendFeedback(info.income);
        v.onboarding.did('send');
        break;
      }
      case 'oil': {
        const v = m.views.find((x) => x.player === ev.player);
        if (v) v.hud.alert(`Weapon oiled: half your damage is now ${ev.dmgType}`, 'good', 2200);
        break;
      }
      default: break;
    }
  }
  if (m.deathPos.size > 400) m.deathPos.clear();
}

function endMatch() {
  const m = app.match; if (!m) return;
  for (const v of m.views) {
    v.hud.destroy(); v.bar.destroy(); v.shop.destroy(); v.sendPanel.destroy(); v.onboarding.destroy(); v.numbers.clear();
    app.gfx.removeViewport(v.vp);
    v.root.remove();
  }
  m.actors.dispose(); m.fx.dispose();
  app.match = null; app.results = null;
  $('screen-match').replaceChildren();
  document.body.classList.remove('targeting', 'over-pad');
}

function matchFrame(dt, frames) {
  const m = app.match;
  const s = m.sim.state;
  const kbmFrame = frames.get('kbm');
  let overPad = false;
  for (const v of m.views) {
    const dev = app.devices.get(v.device);
    const connected = !!dev && dev.connected !== false && !dev.duplicate;
    if (!connected && !v.lost) { v.lost = true; v.hud.alert(`Controller lost — press A on a controller to take over Player ${v.slotPlayer}`, 'bad', 6000); }
    const f = connected ? frames.get(v.device) : null;
    if (v.vp.rect && kbmFrame?.pointer?.inside && v.isPad) {
      const p = kbmFrame.pointer, r = v.vp.rect;
      if (p.x >= r.x && p.x < r.x + r.w) overPad = true;
    }
    if (m.pausedBy) {
      if (m.pausedBy === v && f) v.hud.pauseFrame(f);
      v.camera.update(dt, {});
      continue;
    }
    let capture = false;
    if (v.isPad && f) {
      if (v.talentMode) { if (v.hud.talentFrame(f)) capture = true; else v.talentMode = false; }
      else if (v.sendPanel.open) { v.sendPanel.frame(f, dt); capture = true; }
      else if (v.shop.open) { v.shop.frame(f); capture = true; }
    } else if (f && (v.sendPanel.open || v.shop.open)) {
      // Keyboard: Esc closes the open panel; arrows / Enter drive the send panel.
      if (f.pressed.has('back')) { v.sendPanel.setOpen(false); v.shop.setOpen(false); }
      else if (v.sendPanel.open) v.sendPanel.frame(f, dt);
      capture = true;
    }
    const intents = v.seat.update(f, dt, { capture, connected });
    if (!v.isPad) {
      document.body.classList.toggle('targeting', v.seat.targeting === 'amove');
      v.targetHint.hidden = v.seat.targeting !== 'amove';
    }
    if (intents.zoom) v.camera.zoomBy(intents.zoom);
    if (intents.centre) v.camera.centre();
    const heroA = m.actors.get(s.players[v.player].heroEnt);
    const heroAlive = heroA && heroA.ent.alive !== false;
    if (intents.centre) v.lookIdx = 0;
    // Walking up to the Muster Hall opens it; walking away closes it again (if walking opened it).
    if (v.hall) {
      const near = !!heroAlive && Math.hypot(heroA.x - v.hall.x, heroA.z - (v.hall.z + 3.6)) < 4.2;
      if (near && !v.nearHall && !v.sendPanel.open) toggleHall(v, 'walk', true);
      if (!near && v.nearHall && v.sendPanel.open && v.hallBy === 'walk') v.sendPanel.setOpen(false);
      v.nearHall = near;
      const p = v.project(v.hall.x, 8.6, v.hall.z);
      const show = p.visible && !v.sendPanel.open;
      v.hallLabel.hidden = !show;
      if (show) v.hallLabel.style.transform = `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px) translate(-50%, -100%)`;
      v.hallLabel.classList.toggle('near', near);
      const hover = !v.isPad && v.seat.ground && Math.hypot(v.seat.ground.x - v.hall.x, v.seat.ground.z - (v.hall.z + 1.5)) < 5.5;
      app.world.hallHighlight(v.myTeam, !!hover || near);
      if (hover) document.body.classList.add('hall-hover'); else if (!v.isPad) document.body.classList.remove('hall-hover');
    }
    v.camera.update(dt, {
      follow: heroAlive ? { x: heroA.x, z: heroA.z } : { x: v.myField.spawn.x, z: v.myField.spawn.z - 8 },
      leadPoint: v.seat.ground,
      pan: intents.pan, drag: intents.drag, viewportH: v.vp.rect.h,
    });
  }
  document.body.classList.toggle('over-pad', overPad);
  if (overPad && kbmFrame) { const c = dimCursor(); c.style.transform = `translate(${kbmFrame.pointer.x}px, ${kbmFrame.pointer.y}px)`; }

  const paused = !!m.pausedBy;
  const events = m.clock.frame(dt * 1000, () => m.views.flatMap((v) => v.seat.take()));
  if (events.length) handleEvents(events);
  m.actors.sync(s, m.clock.alpha, paused ? 0 : dt);
  m.fx.syncZones(s.zones, paused ? 0 : dt);
  for (const t of s.teams) app.world.setBanners(t.id, t.bannersMax ? t.banners / t.bannersMax : 0);
  m.fx.update(paused ? 0 : dt);
  for (const v of m.views) {
    const r = v.vp.rect;
    const key = `${r.x},${r.y},${r.w},${r.h}`;
    if (v.root._r !== key) { v.root._r = key; Object.assign(v.root.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); }
    v.hud.update(dt);
    v.bar.update(dt);
    v.shop.update(dt);
    v.sendPanel.update(paused ? 0 : dt);
    // Hint cards after the first step move on by themselves so they never block play (pads have no
    // spare button for "Next"); the first one waits for an actual send.
    const step = v.onboarding.step;
    if (step !== v.obStep) { v.obStep = step; v.obT = 0; }
    if (v.onboarding.open && step !== 'send' && !paused) { v.obT += dt; if (v.obT > 14) v.onboarding.next(); }
    v.numbers.update(dt, v.project);
  }
  if (m.sim.over && !m.shown) {
    m.overDelay -= dt;
    if (m.overDelay <= 0) {
      m.shown = true;
      for (const v of m.views) { v.hud.setPaused?.(false); v.shop.setOpen(false); v.sendPanel.setOpen(false); v.onboarding.close(); }
      setScreen('results');
      const r = s.result;
      const localTeams = [...new Set(m.views.map((v) => v.myTeam))];
      app.session.last = r.winner === -1 ? { cls: 'draw', text: 'Last battle: a draw' }
        : localTeams.length > 1 ? { cls: 'win', text: `Last battle: the ${['Blue', 'Red'][r.winner]} banner won` }
        : { cls: r.winner === localTeams[0] ? 'win' : 'lose', text: r.winner === localTeams[0] ? 'Last battle: Victory' : 'Last battle: Defeat' };
      app.results = showResults({
        card: $('results-card'), sim: m.sim, players: m.views.map((v) => v.player),
        onLobby: () => showLobby(),
        onRematch: () => startMatch(app.session),
        onTitle: () => showTitle(),
      });
    }
  }
}

let dimEl = null;
function dimCursor() {
  if (!dimEl) { dimEl = document.createElement('div'); dimEl.className = 'dim-cursor'; $('app').append(dimEl); }
  return dimEl;
}

function frame(dt) {
  const frames = app.devices.poll();
  if (app.world) app.world.update(dt);
  if (app.screen === 'title') app.title.frame && frames.forEach((f) => app.title.frame(f));
  else if (app.screen === 'lobby') app.lobby.frame(frames, dt);
  if (app.match) matchFrame(dt, frames);
  if (app.screen === 'results' && app.results) frames.forEach((f) => app.results.frame(f));
  if (!app.match) {
    // Title / lobby: drift slowly up the first field and back.
    const f0 = app.layout.fields[0];
    const t = performance.now() / 1000;
    const z = (f0.zGate + f0.zKeep) / 2 + Math.sin(t * 0.08) * 40;
    const x = (f0.x0 + f0.x1) / 2 + Math.sin(t * 0.05) * 30 + 20;
    app.flyCam.update(dt, { follow: { x, z } });
  }
  app.gfx.render();
}

function alertBoot(msg) {
  const el = document.createElement('div');
  el.className = 'boot error'; el.textContent = 'Could not start the match:\n' + msg;
  el.addEventListener('click', () => el.remove());
  $('app').append(el);
}

// ---------------------------------------------------------------- test hooks

/** Start straight away: the keyboard player vs one AI (or `choice.mode` with AIs filling seats). */
app.start = (choice = {}) => {
  const data = app.data;
  const s = app.session;
  s.mode = choice.mode || params.get('mode') || '1v1';
  s.speed = Number(choice.speed || params.get('speed')) || 1;
  s.slots = [];
  const n = Number(s.mode[0]);
  const heroes = Object.keys(data.heroes.heroes), races = Object.keys(data.races.races);
  for (let team = 0; team < 2; team++) for (let i = 0; i < n; i++) {
    s.slots.push({ key: `t${team}s${i}`, team, index: i, kind: 'ai', ai: choice.ai || params.get('ai') || 'recruit', device: null, lost: false, ready: false,
      hero: heroes[(team + i) % heroes.length], race: races[0], player: 0 });
  }
  const me = s.slots[0];
  Object.assign(me, { kind: 'local', device: 'kbm', deviceType: 'keyboard', deviceLabel: 'Keyboard + mouse', player: 1,
    hero: choice.hero || params.get('hero') || me.hero, race: choice.race || params.get('race') || me.race });
  app.devices.claim('kbm', me.key);
  startMatch(s);
};
app.state = () => app.match?.sim.state;
app.views = () => app.match?.views || [];
/** Run the sim forward `ticks` ticks right now (AI plays; local heroes get only queued commands). */
app.fastForward = (ticks) => {
  const m = app.match; if (!m) return 0;
  let n = 0;
  while (n < ticks && !m.sim.over) { m.sim.step(m.views.flatMap((v) => v.seat.take())); handleEvents(m.sim.drainEvents(), true); n++; }
  return n;
};
/** Render now and measure each viewport: luminance spread over a 12x12 grid (0 = blank). */
app.probe = () => {
  app.gfx.render();
  const gl = app.gfx.renderer.getContext();
  const pr = app.gfx.renderer.getPixelRatio();
  const H = gl.drawingBufferHeight;
  const px = new Uint8Array(4);
  return app.gfx.viewports.map((vp) => {
    const r = vp.rect, vals = [];
    for (let yi = 1; yi <= 12; yi++) for (let xi = 1; xi <= 12; xi++) {
      const x = Math.floor((r.x + (r.w * xi) / 13) * pr), y = H - 1 - Math.floor((r.y + (r.h * yi) / 13) * pr);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      vals.push(0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]);
    }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    return { id: vp.id, rect: { ...r }, mean, sd };
  });
};

boot().catch((err) => {
  console.error(err);
  bootEl.classList.add('error');
  bootEl.textContent = 'Bannerline failed to load:\n' + (err.stack || err.message);
});
