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
import { createActors, capsuleBody } from './view/actors.js';
import { loadLooks, createBodyFactory } from './view/unit-looks.js';
import { createPortrait } from './view/portrait.js';
import { buildStructures } from './view/structures.js';
import { loadIdentity } from './view/identity.js';
import { makeTurret } from './view/engineer.js';
import { createSkillFx } from './view/skillfx.js';
import { createSound } from './view/sound.js';
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
import { showResults } from './ui/results.js';
import { createBarracks } from './ui/barracks.js';
import { createOutfitter } from './ui/outfitter.js';
import { createDrillYard } from './ui/drillyard.js';
import { createSanctum } from './ui/sanctum.js';
import { BUILDING_NAMES, BUILDING_KEYS, BUILDING_PAD } from './ui/townpanel.js';
import { installGameTips } from './ui/tips.js';
import { createAimOverlay } from './view/aim.js';
import { buildingsFor } from './sim/buildings.js';
import { modeList } from './sim/modes/index.js';
import { createModeScreen } from './ui/modes.js';
import { createOnboarding, shouldOnboard } from './ui/onboarding.js';
import { createIconLibrary } from './view/icons.js';
import { installTooltips } from '../../../shared/tooltip.js';
import { createSim, restoreSim, TICK_MS } from './sim/sim.js';
import { createTransport, cleanRoomCode } from './net/transport.js';
import { createRoom, joinRoom, beginMatch } from './net/lobbysync.js';
import { createNetClock } from './net/netclock.js';
import { createJoinScreen, createNetLobby } from './ui/netlobby.js';
import { loadCampaign, campaignProgress, campaignSession, createCampaignScreen, createCampaignOverlay, showDebrief } from './ui/campaign.js';
import { createMenuNav } from './ui/menunav.js';
import { createHvfGame } from './ui/hvf/game.js';
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
  installGameTips(() => (app.match ? { sim: app.match.sim, Q } : null));
  try { app.icons = await createIconLibrary(); } catch (err) { console.warn('icons unavailable', err); app.icons = null; }
  // Stream C's art: identity (team/race colours), real bodies, structures. ?bodies=capsule keeps the
  // M1 capsules (fast headless tests); any failure falls back to them too.
  try { app.identity = await loadIdentity(); } catch (err) { console.warn('identity unavailable', err); app.identity = null; }
  if (params.get('bodies') !== 'capsule') {
    try {
      app.looks = await loadLooks();
      app.bodies = createBodyFactory(app.looks, { fallback: capsuleBody, makeTurret, colorOf: (ent) => teamColorOf(ent) });
      app.bodiesReady = app.bodies.preload().catch((err) => console.warn('body preload', err));
    } catch (err) { console.warn('looks unavailable', err); app.looks = null; app.bodies = null; }
  }

  app.gfx = createRenderer($('view'));
  app.devices = createDeviceManager({ root: $('app') });
  app.flyCam = createRtsCamera();
  app.flyViewport = { id: 'fly', camera: app.flyCam.camera, rect: { x: 0, y: 0, w: 1, h: 1 }, layout(size) { this.rect = { x: 0, y: 0, w: size.w, h: size.h }; } };
  app.gfx.addViewport(app.flyViewport);

  // Backdrop: the 1v1 vale, slowly flown over.
  ensureWorld(buildMap(data, 'vale', '1v1'));

  app.session = defaultSession(data);
  app.title = createTitle({
    screen: $('screen-title'),
    onPlay: () => { app.pendingOnline = false; showModes(); },
    onHost: () => { app.pendingOnline = true; showModes(); },
    onJoin: () => showJoin(),
    onCampaign: () => showCampaign(),
  });
  // Hunters vs Farmers (stream H) owns its whole session: setup card, match, results.
  app.hvf = createHvfGame({ gfx: app.gfx, data, host: $('screen-hvf'), devices: app.devices, params,
    onExit: () => { $('screen-hvf').hidden = true; showModes(); } });
  app.join = createJoinScreen({ screen: $('screen-netjoin'), onJoin: (code) => joinOnline(code), onBack: () => showTitle() });
  app.netroom = createNetLobby({ screen: $('screen-netroom'), data, devices: app.devices, onLeave: () => showTitle() });
  app.modes = createModeScreen({
    screen: $('screen-modes'), modes: modeList(data),
    onPick: (mode) => {
      if (mode.id === 'hvf') { endMatch(); app.title.hide(); app.lobby.hide(); setScreen('hvf'); $('screen-hvf').hidden = false; app.hvf.openSetup(); return; }
      const s = app.session;
      Object.assign(s, { game: mode.id, gameName: mode.name, heroes: mode.heroes, races: mode.races });
      if (!mode.formats.includes(s.mode)) s.mode = mode.defaultFormat || mode.formats[0];
      if (app.pendingOnline) hostOnline(mode); else showLobby();
    },
    onBack: () => showTitle(),
  });
  app.lobby = createLobby({
    screen: $('screen-lobby'), data, devices: app.devices, session: app.session,
    onStart: (session) => startMatch(session),
    onBack: () => showModes(),
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
  else {
    showTitle();
    const rj = loadRejoin();
    if (rj) app.title.offerRejoin?.(rj.code, () => rejoinOnline(rj));
  }
}

function ensureWorld(map, format = '1v1', teams = null) {
  const key = map.id + ':' + map.fields.length + ':' + map.width + ':' + format + ':' + JSON.stringify(teams || []);
  if (app.world && app.worldKey === key) return;
  app.world?.dispose();
  let buildings = [];
  try { buildings = buildingsFor(app.data, map, format); } catch (err) { console.warn('no buildings', err); }
  app.layout = layoutFromMap(map, buildings);
  app.world = null;
  if (app.identity && params.get('world') !== 'plain') {
    try {
      const w = buildStructures(app.gfx.scene, app.layout, { identity: app.identity, buildings, teams });
      // Same surface as terrain.js: highlight(buildingId) maps to C's per-team setHover.
      w.highlight = (bid, on) => { const b = buildings.find((x) => x.id === bid); if (b) w.setHover(b.team, b.kind, on); };
      app.world = w;
    } catch (err) { console.warn('structures failed, plain vale instead', err); }
  }
  if (!app.world) app.world = buildWorld(app.gfx.scene, app.layout);
  app.worldKey = key;
}

function setScreen(name) {
  app.screen = name;
  $('screen-title').hidden = name !== 'title';
  $('screen-lobby').hidden = name !== 'lobby';
  $('screen-modes').hidden = name !== 'modes';
  $('screen-netjoin').hidden = name !== 'netjoin';
  $('screen-hvf').hidden = name !== 'hvf';
  $('screen-campaign').hidden = name !== 'campaign';
  if (name !== 'campaign' && app.campaignScreen) { app.campaignScreen.destroy(); app.campaignScreen = null; }
  $('screen-netroom').hidden = name !== 'netroom';
  $('screen-match').hidden = name !== 'match' && name !== 'results';
  $('screen-results').hidden = name !== 'results';
}
function showTitle() {
  saveRejoin(app.match?.net ? null : loadRejoin());   // leaving a running online match on purpose forgets it
  if (app.room) { const r = app.room; app.room = null; try { r.leave(); } catch { /* already closed */ } app.netroom.detach(); }
  app.hvf?.end(); endMatch(); app.lobby.hide(); setScreen('title'); app.title.show(); useFlyCam(); }
function showModes() { app.hvf?.end(); endMatch(); app.title.hide(); app.lobby.hide(); setScreen('modes'); app.modes.show(); useFlyCam(); }
// ---------------------------------------------------------------- campaign (stream F)

async function showCampaign() {
  endMatch(); app.title.hide();
  try { app.campaign = app.campaign || await loadCampaign(); } catch (err) { alertBoot(err.message, 'Could not load the campaign'); showTitle(); return; }
  app.progress = app.progress || campaignProgress();
  setScreen('campaign');
  app.campaignScreen = createCampaignScreen({ screen: $('screen-campaign'), campaign: app.campaign, progress: app.progress, onPlay: (mission) => playMission(mission), onBack: () => showTitle() });
  useFlyCam();
}
function playMission(mission) {
  const dev = app.devices.get(app.lastDevice) || app.devices.kbm;
  const { config, session } = campaignSession(mission, { device: dev.id, deviceType: dev.type });
  session.speed = Number(params.get('speed')) || 1;
  startMatch(session, null, config);
}
function nextMissionOf(mission) {
  for (const c of app.campaign?.index.chapters || []) {
    const i = c.missions.indexOf(mission.id);
    if (i >= 0 && c.missions[i + 1]) return app.campaign.missions[c.missions[i + 1]] || null;
  }
  return null;
}

function showJoin() { endMatch(); app.title.hide(); setScreen('netjoin'); app.join.show(); useFlyCam(); }
function showNetRoom() { endMatch(); app.title.hide(); setScreen('netroom'); app.netroom.show(); useFlyCam(); }

// ---------------------------------------------------------------- online (stream D's js/net)

async function netTransport() { return createTransport(params.get('net') || 'peerjs'); }
async function hostOnline(mode) {
  try {
    const room = await createRoom({ transport: await netTransport(), name: 'Host', dataHash: app.data.hash, mode: mode.id, format: app.session.mode });
    attachRoom(room);
  } catch (err) { showTitle(); alertBoot(err.message || String(err), 'Could not host a room'); }
}
async function joinOnline(code) {
  const room = await joinRoom({ transport: await netTransport(), code: cleanRoomCode(code), name: 'Guest', dataHash: app.data.hash });
  attachRoom(room);
}
function attachRoom(room) {
  app.room = room;
  app.netroom.attach(room);
  showNetRoom();
  room.on('start', (packet) => netStart(room, packet));
  room.on('lobby', () => { if (app.screen === 'results' || app.screen === 'match') showNetRoom(); });
  room.on('closed', () => {
    if (app.room !== room) return;
    app.room = null;
    if (app.match?.net) { for (const v of app.match.views) v.hud.alert('Host left — match ended', 'bad', 4000); setTimeout(() => showTitle(), 2500); }
    else if (app.screen === 'netroom') { showTitle(); alertBoot('The room closed.', 'Online'); }
  });
}
function netStart(room, packet, rejoin = null) {
  let match;
  try {
    match = beginMatch(room, packet, { data: app.data, createSim, restoreSim, now: () => performance.now(), onEvent: (type, e) => netEvent(type, e), rejoin });
  } catch (err) { alertBoot(err.message, 'Could not start'); return; }
  const clock = createNetClock({ lockstep: match.lockstep, tickMs: packet.tickMs });
  clock.attachVisibility(document);
  const session = { ...app.session, game: packet.config.mode, mode: packet.config.format || app.session.mode, speed: 1 };
  const mine = packet.machines.find((x) => x.id === room.me) || rejoin?.machine;
  if (mine?.token && !room.isHost) saveRejoin({ code: room.code || room.state?.code, token: mine.token, name: mine.name });
  const net = { match, clock, room };
  // A rejoin has no sim until the host's snapshot lands: wait for it ("Rejoining…").
  if (!clock.sim) { app.pendingNet = { session, net, since: performance.now() }; alertBoot('Catching up with the match…', 'Rejoining'); return; }
  startMatch(session, net);
}
function netEvent(type, e = {}) {
  const views = app.match?.views || [];
  const say = (text, kind = 'info', ms = 3600) => { for (const v of views) v.hud.alert(text, kind, ms); };
  if (type === 'takeover') say(`${e.name || 'A player'} left — an AI takes their seat`, 'warn');
  else if (type === 'rejoin') say(`${e.name || 'A player'} is back`, 'good');
  else if (type === 'hostLeft') { say('Host left — match ended', 'bad', 4000); setTimeout(() => showTitle(), 2500); }
  else if (type === 'refused') {
    // The host has no seat for our rejoin token (the match moved on): stop waiting and go home.
    saveRejoin(null);
    app.pendingNet = null;
    showTitle();   // leaves the room and detaches the room screen
    alertBoot('The match no longer has your seat.', 'Could not rejoin');
  }
}

// Rejoin after a reload: the room code + this machine's token live in sessionStorage during a match.
const REJOIN_KEY = 'bannerline.rejoin';
function saveRejoin(v) { try { if (v) sessionStorage.setItem(REJOIN_KEY, JSON.stringify(v)); else sessionStorage.removeItem(REJOIN_KEY); } catch { /* private window */ } }
function loadRejoin() { try { return JSON.parse(sessionStorage.getItem(REJOIN_KEY) || 'null'); } catch { return null; } }
async function rejoinOnline(info) {
  try {
    const room = await joinRoom({ transport: await netTransport(), code: info.code, name: info.name || 'Guest', dataHash: app.data.hash, rejoinToken: info.token });
    if (!room.rejoin) { saveRejoin(null); alertBoot('That match has ended.', 'Rejoin'); attachRoom(room); return; }
    app.room = room;
    app.netroom.attach(room);
    room.on('start', (packet) => netStart(room, packet));
    room.on('closed', () => { if (app.room === room) { app.room = null; saveRejoin(null); } });
    netStart(room, room.rejoin.packet, room.rejoin);
  } catch (err) { saveRejoin(null); alertBoot(err.message || String(err), 'Could not rejoin'); showTitle(); }
}
/** Debug speed for online tests: the host's start packet runs faster ticks (everyone follows). */
app.startOpts = () => ({ tickMs: 50 / (Number(params.get('speed')) || 1) });

function showLobby() {
  app.hvf?.end(); endMatch(); app.title.hide(); setScreen('lobby'); app.lobby.show(); useFlyCam(); }
function useFlyCam() {
  if (!app.gfx.viewports.includes(app.flyViewport)) app.gfx.addViewport(app.flyViewport);
  app.flyCam.setBounds({ x0: -1e9, x1: 1e9, z0: -1e9, z1: 1e9 });
}

// ---------------------------------------------------------------- match

function startMatch(session, net = null, campaignConfig = null) {
  endMatch();
  const data = app.data;
  const seed = params.get('seed') ? Number(params.get('seed')) >>> 0 : ((Math.random() * 0xffffffff) >>> 0);
  let players, local;
  if (net) {
    // Online: this machine's seats are the match's localPlayers; their devices claimed them in the room.
    local = net.match.localPlayers.map((lp) => {
      const dev = app.devices.get(lp.device) || app.devices.kbm;
      return { player: lp.pid, slot: { key: 'net' + lp.pid, player: (lp.local | 0) + 1, device: dev.id, deviceType: dev.type, team: null } };
    });
  } else if (campaignConfig) {
    // A mission: its own players list as is; one local seat (mission.player) for the chosen device.
    const slot = session.slots.find((x) => x.kind === 'local');
    local = [{ player: session.campaign.player ?? 0, slot: { ...slot, key: 'cmp', player: 1 } }];
    app.devices.claim(slot.device, 'cmp');
  } else ({ players, local } = sessionToPlayers(session, data));
  let base;
  try { base = net ? net.clock.sim : campaignConfig ? createSim({ ...campaignConfig, seed }, data) : createSim({ seed, mode: session.game || 'linewar', format: session.mode, map: session.map || 'vale', players }, data); } catch (err) {
    console.error(err);
    alertBoot(err.message);
    showLobby();
    return;
  }
  // Every reader goes through this proxy: online, a resync replaces the sim object under the clock.
  const sim = simProxy(() => (net ? net.clock.sim || base : base));
  // Each team's town is dressed in its first player's race.
  const teamsArt = [0, 1].map((t) => { const p = sim.state.players.find((x) => x.team === t); return { team: t, race: p?.race, slot: p ? sim.state.players.filter((x) => x.team === t).indexOf(p) + t * 3 : t * 3 }; });
  ensureWorld(sim.map, sim.state.mode, teamsArt);
  app.gfx.removeViewport(app.flyViewport);

  const firstTeam = local.length ? sim.state.players[local[0].player].team : 0;
  const actors = createActors({ scene: app.gfx.scene, data, localTeam: firstTeam, makeBody: app.bodies ? app.bodies.makeBody : capsuleBody });
  const tickHz = data.econ?.clock?.tickHz || 20;
  const useSpells = params.get('bodies') !== 'capsule';
  const fx = createFx({ scene: app.gfx.scene, actors, tickHz, data, map: sim.map });
  const clock = net ? net.clock : createLocalClock({ sim: base, tickMs: TICK_MS, speed: Number(params.get('speed')) || session.speed || 1 });
  const m = { sim, net, clock, actors, fx, views: [], session, deathPos: new Map(), overDelay: 1.6, pausedBy: null, shown: false, aim: createAimOverlay(app.gfx.scene) };
  app.match = m;
  // Stream C's spell effects and sound load in the background; until they land fx.js draws the spells.
  if (useSpells) {
    createSkillFx({ scene: app.gfx.scene, camera: app.flyCam.camera, actors, tickHz, heroes: data.heroes })
      .then((sp) => { if (app.match === m) { m.spells = sp; fx.spellsElsewhere = true; } else sp.dispose?.(); })
      .catch((err) => console.warn('skill fx unavailable', err));
  }
  if (params.get('mute') !== '1') {
    createSound({ localPlayers: local.map((l) => l.player), heroes: data.heroes, tickHz,
      entOf: (id) => m.sim.state.ents.find((e) => e.id === id),
      panOf: (x, z) => { const v = m.views[0]; if (!v) return null; const p = v.project(x, 1, z); return p.visible ? Math.max(-1, Math.min(1, (p.x / v.vp.rect.w) * 2 - 1)) : null; } })
      .then((snd) => { if (app.match === m) { m.sound = snd; snd.unlock?.(); } })
      .catch((err) => console.warn('sound unavailable', err));
  }

  const seats = local.slice(0, MAX_LOCAL);
  const host = $('screen-match');
  host.replaceChildren();
  seats.forEach((l, i) => m.views.push(makeView(m, i, seats.length, l, host)));

  setScreen('match');
  app.title.hide(); app.lobby.hide();
  if (campaignConfig && m.views[0]) m.overlay = createCampaignOverlay({ root: m.views[0].root });
  for (const v of m.views) {
    const w = document.createElement('div'); w.className = 'net-wait'; w.hidden = true; v.hudRoot.append(w); v.netWait = w;
  }
  for (const v of m.views) v.hud.alert(v.isPad ? 'Hold your field. D-pad down opens the Barracks.' : 'Hold your field. B opens the Barracks to hire units.', 'info', 3600);
}

/** A read-only stand-in for the sim that always points at the current sim object. */
/** Team colour for a hero body (C's identity slot colours when loaded). */
function teamColorOf(ent) {
  const id = app.identity;
  try { return id ? id.teamColor(ent.team) : null; } catch { return null; }
}

function simProxy(get) {
  return {
    get state() { return get().state; }, get data() { return get().data; }, get map() { return get().map; },
    get over() { return get().over; }, get tick() { return get().tick; },
    step(c) { return get().step(c); }, drainEvents() { return get().drainEvents(); }, hash() { return get().hash(); },
  };
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
    buildings: (app.layout.buildings || []).filter((b) => b.team === myTeam), near: null, openedBy: null, lookIdx: 0, aim: null };
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
    onPause: (v) => { m.clock.setPaused(v); m.pausedBy = v ? view : null;   // online the clock ignores it: the menu opens, the match runs on
      for (const o of m.views) o.root.classList.toggle('paused-other', v && o !== view); },
    onSurrender: () => view.seat.issue({ type: 'surrender' }),
    onQuit: () => showLobby(),
    onHowTo: () => view.onboarding.start(),
  });
  const unitIcon = (u) => app.icons?.url('unit', u) || null;
  const itemIcon = (ic) => app.icons?.url('item', ic) || null;
  view.bar = createControlBar({ root: hudRoot, sim, Q, player, seat: view.seat, actors: m.actors, minimapLayout: app.layout, isPad, itemIconUrl: itemIcon, skillIconUrl: (id) => app.icons?.url('skill', id) || null });
  // The four town buildings' panels (owner round 2). One open at a time per view.
  view.panels = {
    barracks: createBarracks({ root: hudRoot, sim, Q, player, seat: view.seat, isPad, iconUrl: unitIcon, onSend: ({ ok }) => sfx(ok ? 'send' : 'refuse') }),
    shop: createOutfitter({ root: hudRoot, sim, Q, player, seat: view.seat, isPad, iconUrl: itemIcon, onWalk: () => walkTo(view, 'shop') }),
    drillyard: createDrillYard({ root: hudRoot, sim, Q, player, seat: view.seat, isPad, iconUrl: itemIcon }),
    sanctum: createSanctum({ root: hudRoot, sim, Q, player, isPad, iconUrl: itemIcon, onPick: (row) => beginAim(view, row) }),
  };
  view.panels.barracks.heldKey = (code) => app.devices.kbm.isDown(code);
  // The live 3D portrait (stream C) shows the selected unit, or your hero.
  if (app.looks) {
    try {
      view.portrait = createPortrait({ gfx: app.gfx, slot: view.bar.portraitSlot, looks: app.looks });
      const showSel = (id) => {
        const s = sim.state;
        const e = (id >= 0 && s.ents.find((x) => x.id === id)) || s.ents.find((x) => x.id === s.players[player].heroEnt);
        view.portraitId = e?.id ?? -1;
        view.portrait.showEnt(e ? { kind: e.kind, type: e.type } : null);
      };
      view.bar.onSelect(showSel);
      showSel(-1);
    } catch (err) { console.warn('portrait unavailable', err); view.portrait = null; }
  }
  view.openPanel = () => Object.values(view.panels).find((p) => p.open) || null;
  view.bar.onBuilding((kind) => togglePanel(view, kind, 'button'), () => view.openPanel()?.kind || null);
  view.hud.onArmy(() => lookAtField(view, 1));
  // A floating name over each of your town buildings, with its key.
  view.labels = view.buildings.map((b) => {
    const el = document.createElement('div');
    el.className = 'hall-label k-' + b.kind;
    el.innerHTML = `${BUILDING_NAMES[b.kind] || b.name} ${isPad ? `<kbd class="pad">${BUILDING_PAD[b.kind]}</kbd>` : `<kbd>${BUILDING_KEYS[b.kind]}</kbd>`}`;
    el.dataset.tip = b.desc || '';
    overlay.append(el);
    return { b, el };
  });
  const aimHint = document.createElement('div');
  aimHint.className = 'aim-hint'; aimHint.hidden = true;
  hudRoot.append(aimHint);
  view.aimHint = aimHint;
  view.onboarding = createOnboarding({ root: hudRoot, isPad });
  if (shouldOnboard()) view.onboarding.start();
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
    pad.innerHTML = '<kbd class="pad">↓</kbd> Barracks · <kbd class="pad">View</kbd> Outfitter · <kbd class="pad">↑</kbd> Drill Yard · <kbd class="pad">LB</kbd> Sanctum · <kbd class="pad">LT</kbd>+skill learn · <kbd class="pad">Menu</kbd> pause';
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
  } else if (u.type === 'pause') {
    if (view.aim) { endAim(view); return; }
    if (!m.sim.over && !m.pausedBy) view.hud.setPaused(true);
  } else if (u.type === 'scoreboard') {
    view.hud.showBoard(!view.hud.boardOpen);
  } else if (u.type === 'building') {
    if (view.aim) endAim(view);
    if (u.kind === 'shop' && view.isPad && view.hud.talentOpen && !view.talentMode && !view.panels.shop.open) { view.talentMode = true; return; }
    view.talentMode = false;
    togglePanel(view, u.kind, 'key');
  } else if (u.type === 'interact') {
    if (view.near && !view.openPanel()) togglePanel(view, view.near.kind, 'key', true);
  } else if (u.type === 'clickGround') {
    if (view.aim) { castAim(view, u.x, u.z); return true; }
    // Clicking one of your buildings (its footprint or the ring by its door) opens its panel.
    const b = buildingAt(view, u.x, u.z);
    if (b) { togglePanel(view, b.kind, 'click', true); return true; }
    return false;
  } else if (u.type === 'rightClick') {
    if (view.aim) { endAim(view); return true; }
    return false;
  } else if (u.type === 'nextField') {
    lookAtField(view, (view.lookIdx + 1) % fieldOrder(view).length);
  } else if (u.type === 'useNth') {
    // Pad d-pad left / right: use the first / second usable item carried.
    const inv = Q.inventoryInfo(m.sim.state, m.sim.data, view.player);
    const usable = inv.slots.filter((x) => x && x.consumable);
    const it = usable[u.n];
    if (it) view.seat.issue({ type: 'use', slot: it.slot });
    else view.hud.alert(u.n ? 'No second item to use' : 'No item to use — buy draughts at the Outfitter', 'info', 1400);
  }
}

/** Your building at a ground point (footprint or door ring), or null. */
function buildingAt(view, x, z) {
  for (const b of view.buildings) {
    const [w, d] = b.size || [6, 6];
    const r = ringPoint(b);
    if (Math.abs(x - b.x) < w / 2 + 1 && Math.abs(z - b.z) < d / 2 + 1) return b;
    if (Math.hypot(x - r.x, z - r.z) < 2.8) return b;
  }
  return null;
}
/** The interaction ring in front of a building's door (matches terrain.js buildingModel). */
function ringPoint(b) {
  const yaw = { '+z': 0, '+x': Math.PI / 2, '-z': Math.PI, '-x': -Math.PI / 2 }[b.door] ?? 0;
  const dist = (b.size?.[1] || 6) / 2 + 2.6;
  return { x: b.x + Math.sin(yaw) * dist, z: b.z + Math.cos(yaw) * dist };
}
/** Open / close a building panel. `by` = 'walk' | 'key' | 'click' | 'button'. */
function togglePanel(view, kind, by, forceOpen = false) {
  const p = view.panels[kind]; if (!p) return;
  const open = forceOpen || !p.open;
  for (const o of Object.values(view.panels)) if (o !== p) o.setOpen(false);
  if (open) view.openedBy = by;
  if (open !== p.open) app.match?.sound?.ui?.(open ? 'open' : 'close');
  p.setOpen(open);
  if (open && kind === 'barracks') view.onboarding.did('openHall');
}
/** Right-click-walk the hero to a building (the Outfitter's "Walk there"). */
function walkTo(view, kind) {
  const b = view.buildings.find((x) => x.kind === kind); if (!b) return;
  const r = ringPoint(b);
  view.seat.issue({ type: 'move', x: r.x, z: r.z });
  view.hud.alert(`Walking to the ${BUILDING_NAMES[kind]}`, 'info', 1400);
}

// ---------- Sanctum power targeting ----------
function beginAim(view, row) {
  const m = app.match;
  const map = m.sim.map;
  const ok = (f) => (row.kind === 'neutral' ? true : row.kind === 'defensive' ? f.team === view.myTeam : f.team !== view.myTeam);
  m.aim.show({ fields: map.fields.map((f) => ({ x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1, ok: ok(f) })), radius: row.radius || 4 });
  // Start the reticle somewhere sensible: your field for defensive, the rival's for offensive.
  const order = fieldOrder(view);
  const f = row.kind === 'offensive' ? order[1] || order[0] : order[0];
  const s = m.sim.state;
  const hero = s.ents.find((e) => e.id === s.players[view.player].heroEnt);
  view.aim = { row, x: row.kind === 'offensive' ? (f.x0 + f.x1) / 2 : hero?.x ?? (f.x0 + f.x1) / 2, z: row.kind === 'offensive' ? (f.z0 + f.z1) / 2 : (hero?.z ?? (f.z0 + f.z1) / 2) - 10 };
  if (view.isPad) { view.seat.stickFrozen = true; view.camera.lookAt(view.aim.x, view.aim.z); }
  else if (row.kind === 'offensive') lookAtField(view, 1);
  document.body.classList.add('aiming');
  view.aimHint.hidden = false;
}
function castAim(view, x, z) {
  const m = app.match; const a = view.aim; if (!a) return;
  const why = Q.powerTargetCheck(m.sim.state, m.sim.data, view.player, a.row.id, x, z);
  if (why) { view.hud.alert(view.hud.reasonText?.(why) || why, 'bad', 1400); return; }
  view.seat.issue({ type: 'power', id: a.row.id, x, z });
  sfx('power', { id: a.row.id });
  m.fx.flare(x, z, 0xc69cff, a.row.radius || 4);
  endAim(view);
}
function endAim(view) {
  if (!view.aim) return;
  view.aim = null;
  view.seat.stickFrozen = false;
  app.match?.aim.hide();
  view.aimHint.hidden = true;
  if (!app.match?.views.some((v) => v.aim)) document.body.classList.remove('aiming');
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
    if (m.spells) { try { m.spells.onEvent(ev.fx ? { ...ev, skill: ev.fx } : ev); } catch (err) { console.warn('skillfx', err); } }
    if (m.sound) { try { m.sound.onEvent(ev); } catch { /* sound is optional */ } }
    for (const v of m.views) v.hud.onEvent(ev);
    switch (ev.type) {
      case 'hit': {
        for (const v of m.views) if (v.portrait && v.portraitId === ev.dst) v.portrait.react?.('hit');
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
      default: break;
    }
  }
  if (m.deathPos.size > 400) m.deathPos.clear();
}

function endMatch() {
  const m = app.match; if (!m) return;
  for (const v of m.views) {
    v.portrait?.dispose?.(); v.hud.destroy(); v.bar.destroy(); for (const p of Object.values(v.panels)) p.destroy(); v.onboarding.destroy(); v.numbers.clear();
    app.gfx.removeViewport(v.vp);
    v.root.remove();
  }
  m.spells?.dispose?.(); m.sound?.stopAll?.(); m.actors.dispose(); m.fx.dispose(); m.aim.dispose(); m.overlay?.destroy();
  app.match = null; app.results = null;
  $('screen-match').replaceChildren();
  document.body.classList.remove('targeting', 'over-pad', 'aiming', 'hall-hover');
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
    const panel = v.openPanel();
    if (v.aim && f) {
      capture = true;
      if (v.isPad) {
        // Aim with the left stick; A casts, B cancels. The camera follows the reticle.
        v.aim.x += f.stickL.x * 26 * dt; v.aim.z += f.stickL.y * 26 * dt;
        const b = app.layout.bounds;
        v.aim.x = Math.max(b.x0, Math.min(b.x1, v.aim.x)); v.aim.z = Math.max(b.z0, Math.min(b.z1, v.aim.z));
        v.camera.lookAt(v.aim.x, v.aim.z);
        if (f.pressed.has('confirm')) castAim(v, v.aim.x, v.aim.z);
        else if (f.pressed.has('back')) endAim(v);
      } else {
        if (v.seat.ground) { v.aim.x = v.seat.ground.x; v.aim.z = v.seat.ground.z; }
        if (f.pressed.has('back')) endAim(v);
        capture = false;          // the mouse click casts through clickGround; keep the camera keys
      }
    } else if (v.isPad && f) {
      if (v.talentMode) { if (v.hud.talentFrame(f)) capture = true; else v.talentMode = false; }
      else if (panel) { panel.frame(f, dt); capture = true; }
    } else if (f && panel) {
      // Keyboard: Esc closes the open panel; arrows / Enter (and the Barracks' letter grid) drive it.
      if (f.pressed.has('back')) panel.setOpen(false);
      else panel.frame(f, dt);
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
    // Walking up to a building opens its panel; walking away closes it again (if walking opened it).
    // A teleport (respawn inside the Outfitter) does not count as walking up.
    let near = null;
    if (heroAlive) for (const b of v.buildings) {
      const r = ringPoint(b);
      const inRange = b.radius != null ? Math.hypot(heroA.x - b.x, heroA.z - b.z) <= b.radius - 0.5 : Math.hypot(heroA.x - r.x, heroA.z - r.z) < 3;
      if (inRange) { near = b; break; }
    }
    const jumped = v.lastHero && heroAlive && Math.hypot(heroA.x - v.lastHero.x, heroA.z - v.lastHero.z) > 3;
    if (near && near !== v.near && !jumped && !v.openPanel() && v.lastHero) togglePanel(v, near.kind, 'walk', true);
    if (!near && v.near && v.openedBy === 'walk' && v.panels[v.near.kind]?.open) v.panels[v.near.kind].setOpen(false);
    v.near = near;
    v.lastHero = heroAlive ? { x: heroA.x, z: heroA.z } : null;
    const openKind = v.openPanel()?.kind;
    const hoverB = !v.isPad && v.seat.ground ? buildingAt(v, v.seat.ground.x, v.seat.ground.z) : null;
    for (const { b, el } of v.labels) {
      const p = v.project(b.x, 7.5, b.z);
      const show = p.visible && openKind !== b.kind;
      el.hidden = !show;
      if (show) el.style.transform = `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px) translate(-50%, -100%)`;
      el.classList.toggle('near', near === b || hoverB === b);
      app.world.highlight(b.id, near === b || hoverB === b);
    }
    if (!v.isPad) document.body.classList.toggle('hall-hover', !!hoverB);
    if (v.aim) {
      const ok = !Q.powerTargetCheck(s, m.sim.data, v.player, v.aim.row.id, v.aim.x, v.aim.z);
      m.aim.move(v.aim.x, v.aim.z, ok);
      const where = { defensive: 'in your own field', offensive: 'in an enemy field', neutral: 'in any field' }[v.aim.row.kind];
      const key = v.isPad ? '<kbd class="pad">A</kbd> cast · <kbd class="pad">B</kbd> cancel' : 'click to cast · right-click / <kbd>Esc</kbd> cancel';
      const html = `${v.aim.row.name}: choose where it lands ${where} — ${key}${ok ? '' : ' · <span class="bad">not here</span>'}`;
      if (v.aimHint._h !== html) { v.aimHint._h = html; v.aimHint.innerHTML = html; }
    }
    v.camera.update(dt, {
      follow: heroAlive ? { x: heroA.x, z: heroA.z } : { x: v.myField.spawn.x, z: v.myField.spawn.z - 8 },
      leadPoint: v.seat.ground,
      pan: intents.pan, drag: intents.drag, viewportH: v.vp.rect.h,
    });
  }
  document.body.classList.toggle('over-pad', overPad);
  if (overPad && kbmFrame) { const c = dimCursor(); c.style.transform = `translate(${kbmFrame.pointer.x}px, ${kbmFrame.pointer.y}px)`; }

  const paused = !!m.pausedBy && !m.net;
  const waiting = m.clock.waitingFor || [];
  const waitText = waiting.length ? `Waiting for ${waiting.map((w) => w.name + (w.hidden ? ' (tab hidden)' : '')).join(', ')}` : '';
  if (waiting.length) m.waitSince = m.waitSince || performance.now(); else m.waitSince = 0;
  // After 10 s the host may hand a stalled seat to an AI (stream D: lockstep.replaceWithAI).
  const offer = m.net?.room?.isHost && waiting.length && performance.now() - m.waitSince > 10000;
  const waitKey = waitText + (offer ? '|offer' : '');
  for (const v of m.views) if (v.netWait && v.netWait._t !== waitKey) {
    v.netWait._t = waitKey; v.netWait.hidden = !waitText;
    v.netWait.innerHTML = waitText ? `${waitText}${offer ? ' <button class="lb-btn" data-act="ai-takeover">Replace with AI</button>' : ''}` : '';
    v.netWait.onclick = (e) => { if (e.target.closest('[data-act="ai-takeover"]')) for (const w of m.clock.waitingFor || []) m.net.match.lockstep.replaceWithAI(w.id); };
  }
  const events = m.clock.frame(dt * 1000, () => m.views.flatMap((v) => v.seat.take()));
  if (events.length) handleEvents(events);
  m.actors.sync(s, m.clock.alpha, paused ? 0 : dt);
  m.fx.syncZones(s.zones, paused ? 0 : dt);
  // Shape forms (the Druid's wolf): the body swaps to the form's look.
  for (const p of s.players) { const a = m.actors.get(p.heroEnt); if (a?.body?.setForm && a._form !== (p.form || null)) { a._form = p.form || null; a.body.setForm(a._form); } }
  for (const t of s.teams) app.world.setBanners(t.id, t.bannersMax ? t.banners / t.bannersMax : 0);
  m.fx.update(paused ? 0 : dt);
  m.spells?.update(paused ? 0 : dt);
  m.aim.update(dt);
  for (const v of m.views) {
    const r = v.vp.rect;
    const key = `${r.x},${r.y},${r.w},${r.h}`;
    if (v.root._r !== key) { v.root._r = key; Object.assign(v.root.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); }
    v.hud.update(dt);
    v.bar.update(dt);
    for (const p of Object.values(v.panels)) p.update(paused ? 0 : dt);
    // Hint cards after the first step move on by themselves so they never block play (pads have no
    // spare button for "Next"); the first one waits for an actual send.
    const step = v.onboarding.step;
    if (step !== v.obStep) { v.obStep = step; v.obAt = performance.now(); }
    if (v.onboarding.open && step !== 'send' && !paused && performance.now() - v.obAt > 14000) v.onboarding.next();
    // Down: a dim screen and a big "back in N" so a death is never confusing.
    const me = s.players[v.player];
    const heroE = s.ents.find((e) => e.id === me.heroEnt);
    const down = heroE && heroE.alive === false;
    if (down !== v.wasDown) { v.wasDown = down; v.root.classList.toggle('hero-down', !!down); }
    if (down) {
      if (!v.downEl) { v.downEl = document.createElement('div'); v.downEl.className = 'down-card'; v.hudRoot.append(v.downEl); }
      const secs = Math.max(0, Math.ceil(((heroE.respawnAt ?? s.tick) - s.tick) / (m.sim.data.econ?.clock?.tickHz || 20)));
      const txt = `<b>Your hero has fallen</b><span>Back at the Outfitter in <i>${secs}</i></span><small>Your units still march, and your town still works — hire, train and cast powers meanwhile.</small>`;
      if (v.downEl._t !== txt) { v.downEl._t = txt; v.downEl.innerHTML = txt; }
    } else if (v.downEl) { v.downEl.remove(); v.downEl = null; }
    v.numbers.update(dt, v.project);
  }
  m.overlay?.update(m.sim);
  if (m.sim.over && !m.shown) {
    // The result word shows at once over the field; the results card follows after a beat (wall clock).
    if (!m.overAt) {
      m.overAt = performance.now();
      const r = s.result, localTeams = [...new Set(m.views.map((v) => v.myTeam))];
      const word = r.winner === -1 ? 'Draw' : localTeams.length > 1 ? `${['Blue', 'Red'][r.winner]} banner wins` : r.winner === localTeams[0] ? 'Victory' : 'Defeat';
      m.sound?.result?.(word !== 'Defeat');
      for (const v of m.views) {
        v.hud.hideTransient?.(); v.onboarding.close(); for (const p of Object.values(v.panels)) p.setOpen(false); endAim(v);
        v.downEl?.remove(); v.downEl = null; v.root.classList.remove('hero-down');
        const el = document.createElement('div');
        el.className = 'end-word ' + (word === 'Defeat' ? 'lose' : 'win');
        el.textContent = word;
        v.hudRoot.append(el);
      }
    }
    if (performance.now() - m.overAt > 2200) {
      m.shown = true;
      for (const v of m.views) { v.hud.setPaused?.(false); for (const p of Object.values(v.panels)) p.setOpen(false); endAim(v); v.onboarding.close(); }
      setScreen('results');
      const r = s.result;
      const localTeams = [...new Set(m.views.map((v) => v.myTeam))];
      app.session.last = r.winner === -1 ? { cls: 'draw', text: 'Last battle: a draw' }
        : localTeams.length > 1 ? { cls: 'win', text: `Last battle: the ${['Blue', 'Red'][r.winner]} banner won` }
        : { cls: r.winner === localTeams[0] ? 'win' : 'lose', text: r.winner === localTeams[0] ? 'Last battle: Victory' : 'Last battle: Defeat' };
      if (m.net) saveRejoin(null);
      if (m.session.campaign) {
        const mission = m.session.campaign, next = nextMissionOf(mission);
        const card = $('results-card');
        showDebrief({ card, sim: m.sim, mission, progress: app.progress, next,
          onNext: (n) => playMission(n), onRetry: (mi) => playMission(mi), onMap: () => showCampaign() });
        const nav = createMenuNav(card, { selector: 'button', onBack: () => showCampaign() });
        nav.focus(card.querySelector('[data-act="next"]') || card.querySelector('button'));
        const shownAt = performance.now();
        app.results = { frame(f) { if (performance.now() - shownAt > 600) nav.handle(f); } };
        return;
      }
      app.results = showResults({
        card: $('results-card'), sim: m.sim, players: m.views.map((v) => v.player), online: !!m.net,
        onLobby: () => { if (m.net) { if (m.net.room.isHost) m.net.room.backToLobby(); showNetRoom(); } else showLobby(); },
        onRematch: () => startMatch(app.session),
        onTitle: () => { if (m.net) { try { m.net.room.leave(); } catch { /* closed */ } app.room = null; } showTitle(); },
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
  for (const [id, f] of frames) if (f.rawPressed?.length) app.lastDevice = id;
  if (app.screen === 'campaign' && app.campaignScreen) {
    // The campaign screen reads the keyboard itself; pads drive it through nav/confirm/back.
    for (const [id, f] of frames) {
      if (id === 'kbm') continue;
      const p = f.pressed;
      if (p.has('navUp')) app.campaignScreen.nav(0, -1); if (p.has('navDown')) app.campaignScreen.nav(0, 1);
      if (p.has('navLeft')) app.campaignScreen.nav(-1, 0); if (p.has('navRight')) app.campaignScreen.nav(1, 0);
      if (p.has('confirm')) app.campaignScreen.confirm(); if (p.has('back')) app.campaignScreen.back();
    }
  }
  if (app.screen === 'title') app.title.frame && frames.forEach((f) => app.title.frame(f));
  else if (app.screen === 'modes') frames.forEach((f) => app.modes.frame(f));
  else if (app.screen === 'lobby') app.lobby.frame(frames, dt);
  else if (app.screen === 'netjoin') frames.forEach((f) => app.join.frame(f));
  else if (app.screen === 'netroom') app.netroom.frame(frames);
  if (app.pendingNet) {
    const p = app.pendingNet;
    p.net.clock.pump();
    if (p.net.clock.sim) { app.pendingNet = null; document.querySelectorAll('.boot.error').forEach((e) => e.remove()); startMatch(p.session, p.net); }
    else if (performance.now() - p.since > 20000) { app.pendingNet = null; saveRejoin(null); alertBoot('The host did not send the match.', 'Could not rejoin'); showTitle(); }
  }
  if (app.match) matchFrame(dt, frames);
  if (app.screen === 'results' && app.results) frames.forEach((f) => app.results.frame(f));
  if (app.screen === 'hvf') app.hvf.frame(dt, frames);   // frames polled once above (a second poll would lose presses)
  if (!app.match && app.screen !== 'hvf') {
    // Title / lobby: drift slowly up the first field and back.
    const f0 = app.layout.fields[0];
    const t = performance.now() / 1000;
    const z = (f0.zGate + f0.zKeep) / 2 + Math.sin(t * 0.08) * 40;
    const x = (f0.x0 + f0.x1) / 2 + Math.sin(t * 0.05) * 30 + 20;
    app.flyCam.update(dt, { follow: { x, z } });
  }
  app.gfx.render();
}

function alertBoot(msg, title = 'Could not start the match') {
  const el = document.createElement('div');
  el.className = 'boot error'; el.textContent = title + ':\n' + msg + '\n\n(click to close)';
  el.addEventListener('click', () => el.remove());
  $('app').append(el);
}

// ---------------------------------------------------------------- test hooks

/** Start straight away: the keyboard player vs one AI (or `choice.mode` with AIs filling seats). */
app.start = (choice = {}) => {
  const data = app.data;
  const s = app.session;
  s.game = 'linewar'; s.gameName = 'Line War'; s.heroes = null; s.races = null;
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
