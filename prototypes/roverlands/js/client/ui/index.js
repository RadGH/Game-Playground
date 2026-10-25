// Roverlands' screens and HUD — everything outside the 3D view. The lead's js/client/main.js makes ONE of these and
// gets the room (`net`, js/net/client.js) handed to it when a game starts. Phone first (402 x 780 portrait) and
// desktop; controller in every menu (d-pad / stick moves the focus ring, A presses, B backs); nothing scrolls inside a
// panel over the canvas (a whole layer scrolls instead).
//
// ============================================================================================ API (what main.js calls)
//   import { createUI } from './ui/index.js';
//   const ui = createUI({
//     canvas,                         // the game's <canvas> (report pictures; pointer lock is released when a menu opens)
//     prepare: async (seed, progress) => ({ sites, vehicles }),   // build the world for this seed (called before every game;
//                                     //   progress(0..1) moves the loading bar). sites = world.sites, vehicles = vehicles.json
//     onGame: (net, { solo, spectate, mode, seed }) => {},        // the game starts: drive! (net = the room)
//     onLeave: () => {},              // the game ended (left, kicked, room gone): stop drawing it; the title is showing
//     onFollow: pid|null => {},       // spectating: follow this player (null = free camera)
//     getDebug: () => ({}),           // anything for bug reports: { pos, vehicle, fps, ... } (plain JSON)
//     screenshot: () => dataURL|null, // optional: render a frame and return canvas.toDataURL('image/jpeg') (else the canvas is read)
//     vehicles: [...],                // data/vehicles.json entries (names for the map, the rating card, Find a game)
//     defaultSeed: 7,
//   });
//   ui.setFlagSites([{ id, name }])   // the default world's flag sites, for the Host dialog's "Flag site" list
//   ui.setWorld({ size, sites, mapImage, flipZ, labels })   // after the world is built: the minimap + map picture
//                                     //   (view.mapImage() canvas; picture covers [-size/2, size/2], +z DOWN unless flipZ)
//   ui.markers({ you: { x, z, dir:[dx,dz] }, camDir: [dx,dz], players: [{ pid, x, z, dir? }], vehicles: [{ id, kind, x, z, dir }] })
//                                     // every frame (cheap: the minimap redraws 15 a second). Flag / home / site / pins are the UI's own.
//   ui.hud.speed(kmh | null, gear?)   ui.hud.seatHint(text | null)   ui.hud.toast(text)   ui.hud.banner(title, sub?, ms?)
//   ui.hud.flagText(text | null)      (override the flag line; null = the UI's own from the room's flag + run messages)
//   ui.vehicleLeft(kind, secondsDriven)   // after getting out of a seat you DROVE: shows the rating card when due (>= 60 s, once per kind)
//   ui.touchState()                   // the phone controls' held state — pass as createInput(canvas, { touch: ui.touchState })
//   ui.touch.mode('foot'|'drive'|'gunner'|'passenger'|'all')     // which phone buttons show
//   ui.settings() / ui.onSettings(fn) // { quality, volume, mouseSens, padSens, invertY, camDist, touchSize } — pass ui.settings
//                                     //   as createInput's `settings`
//   ui.openMenu()  ui.closeMenu()  ui.openMap()  ui.showTitle()  ui.leave()
//   ui.blocking()                     // true while any menu / screen is up (and for 250 ms after): ignore game input then
//   ui.screen                         // 'title' | 'lobby' | 'loading' | 'game'
//   ui.net  ui.me()  ui.state()       // the room, { name, look }, a plain snapshot for game-eye / tests
// The UI itself handles Esc / Start (menu) and M / Back (map) while in a game, and listens to the room for the flag,
// the run clock, pins, toasts, refusals ('deny' -> a toast), kicks and best times — the game does not need to.
import { connect, serverAvailable, listRooms, lastRoom, forgetRoom } from '../../net/client.js';
import { cleanCode } from '../../net/protocol.js';
import { createNav } from '../../../../knockabout/js/client/nav.js';
import { qrSvg, joinUrl } from '../../../../tumblefair/js/client/qr.js';
import { createWhatsNew } from '../../../../../shared/whats-new.js';
import { el, esc, store, fmtTime, isTouch, createLayers } from './dom.js';
import { createSettings, QUALITIES } from './settings.js';
import { createMe, portrait, lookReady } from './me.js';
import { installAccount } from './account.js';
import { installReport, tally } from './report.js';
import { createHistory, openHistory } from './myruns.js';
import { createRating } from './rating.js';
import { createTouch } from './touch.js';
import { createMapModel, createMinimap, openMapScreen, pinColor } from './map.js';
import { openLookEditor } from './look-editor.js';

const CSS = ['../../../css/roverlands.css', '../../../../../shared/whats-new.css'];
const MODES = { flag: { name: 'Flag Run', blurb: 'Drive out, grab the flag, bring it home. Fastest time wins.' }, sandbox: { name: 'Sandbox', blurb: 'Every vehicle parked around. Drive anything, anywhere.' } };
export const CONTROLS = [
  ['Drive / walk', 'W A S D', 'Left stick (steer) + RT gas / LT brake', 'Stick + GAS / BRAKE'],
  ['Look around', 'Mouse (click to grab it)', 'Right stick', 'Drag on the right side'],
  ['Get in / out', 'E', 'X (Square)', 'ENTER'],
  ['Handbrake / jump', 'Space', 'A (Cross)', 'JUMP'],
  ['Boost / sprint / lean', 'Shift', 'B (Circle) / L3', '—'],
  ['Fire (gunner) / horn', 'Left click / H', 'RT (gunner) / R3', 'FIRE'],
  ['Change seat', 'F', 'Y (Triangle)', 'SEAT'],
  ['Camera distance', 'Mouse wheel / V', 'D-pad up / down', 'Pinch'],
  ['Map / menu', 'M / Esc', 'Back / Start', '☰'],
];

export function createUI(opts = {}) {
  const { canvas = null, prepare = async () => ({}), onGame = () => {}, onLeave = () => {}, onFollow = () => {}, getDebug = () => ({}), screenshot = null, defaultSeed = 7 } = opts;
  for (const href of CSS) { const u = new URL(href, import.meta.url).href; if (![...document.querySelectorAll('link[rel=stylesheet]')].some(l => l.href === u)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = u; document.head.append(l); } }
  let vehicles = Array.isArray(opts.vehicles) ? opts.vehicles : opts.vehicles?.vehicles || [];
  const vehicleName = k => vehicles.find(v => v.id === k)?.name || String(k || 'vehicle').replace(/_/g, ' ');
  let lastClosed = 0, screen = 'boot';
  const layers = createLayers({ onChange: () => { attachNav(); if (!layers.blocking()) lastClosed = performance.now(); else if (document.pointerLockElement) document.exitPointerLock?.(); } });
  const nav = createNav();
  const settings = createSettings();
  const me = createMe();
  const history = createHistory();
  const model = createMapModel();
  const S = { net: null, solo: false, spectate: false, flagSites: [], sites: null, flag: null, run: null, pins: new Map(), names: {}, markers: {}, follow: null, flagOverride: null, entered: false, online: false };
  const news = createWhatsNew({ url: new URL('../../../data/changelog.json', import.meta.url), key: 'roverlands', title: "What's new" });

  // ------------------------------------------------------------------------------------------ fixed chrome: corner + HUD
  const hud = el('div', 'rl-hud'); hud.hidden = true;
  hud.innerHTML = `<div class="rl-tl"><div class="rl-flagbox"><div class="rl-flagline"></div><div class="rl-clock"></div></div>
    <div class="rl-speed" hidden><b>0</b><span>km/h</span><i></i></div></div>
    <div class="rl-seathint" hidden></div><div class="rl-toasts"></div><div class="rl-banner" hidden></div>
    <div class="rl-spectate" hidden></div><div class="rl-netdot" title="Connection"></div>`;
  const minimap = createMinimap(model); hud.append(minimap.el);
  minimap.el.addEventListener('click', () => openMap());
  const corner = el('div', 'rl-cornerbar');
  const menuBtn = el('button', 'rl-corner rl-menu-btn', '☰'); menuBtn.type = 'button'; menuBtn.title = 'Menu'; menuBtn.setAttribute('aria-label', 'Menu');
  const report = installReport({ layers, shot: takeShot, debug: debugInfo, nameOf: () => me.get().name });
  corner.append(menuBtn, report.button);
  const touch = createTouch({ settings: () => settings.get() });
  const rating = createRating({ root: hud, send: m => S.net?.send(m), vehicleName, onRated: r => history.addRating(r) });
  document.body.append(hud, touch.el, corner);
  menuBtn.addEventListener('click', () => openMenu());
  const acct = installAccount({ me, toast: t => toast(t) });
  me.on(cur => { if (S.net) S.net.send({ t: 'me', name: cur.name, look: cur.look }); if (screen === 'title') drawTitle(); });

  // ------------------------------------------------------------------------------------------ helpers
  function takeShot() {
    try { if (screenshot) { const s = screenshot(); if (s) return s; } } catch { /* fall through */ }
    try {
      if (!canvas) return null;
      const k = Math.min(1, 900 / Math.max(canvas.width, canvas.height)), c = document.createElement('canvas');
      c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k); c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.72);
    } catch { return null; }
  }
  function debugInfo() {
    const r = S.net?.room;
    let g = {}; try { g = getDebug() || {}; } catch (e) { g = { debugError: String(e?.message || e) }; }
    return { ui: screen, layers: layers.stack.map(l => l.kind), room: r ? { code: r.code, mode: r.mode, phase: r.phase, seed: r.seed, players: r.players.length, you: r.you, host: r.host, solo: S.solo, spectate: S.spectate } : null,
      net: S.net ? { ...S.net.stats(), online: S.net.online } : null, flag: S.flag, run: S.run ? { phase: S.run.phase, time: S.run.time } : null, settings: settings.get(), game: g };
  }
  function modal(html, { kind = 'modal', onBack = null, cls = '' } = {}) {
    const node = el('div', 'rl-modal ' + cls, `<div class="rl-panel">${html}</div>`);
    const rec = layers.push(node, { kind, onBack: () => (onBack ? onBack() : rec.close()) });
    node.addEventListener('click', e => { if (e.target === node || e.target.closest('[data-x]')) (onBack ? onBack() : rec.close()); });
    return rec;
  }
  function message(title, text) {
    const rec = modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="rl-row end"><button class="rl-btn primary" data-x data-back data-autofocus>OK</button></div>`, { kind: 'message' });
    return rec;
  }
  function attachNav() { const t = layers.top(); if (t && !t.ownPad) nav.attach(t.el.querySelector('.rl-panel') && !t.el.classList.contains('rl-screen') ? t.el.querySelector('.rl-panel') : t.el, { keep: true }); }
  const roomCode = () => S.net?.room?.code || null;

  // ------------------------------------------------------------------------------------------ toasts, banner, HUD bits
  function toast(text, kind = '') {
    const box = hud.hidden ? toastRoot() : hud.querySelector('.rl-toasts');
    const t = el('div', 'rl-toast ' + kind, esc(text)); box.append(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 3200); setTimeout(() => t.remove(), 3700);
  }
  let toastBox = null;
  function toastRoot() { if (!toastBox) { toastBox = el('div', 'rl-toasts rl-toasts-top'); document.body.append(toastBox); } return toastBox; }
  let bannerTimer = 0;
  function banner(title, sub = '', ms = 2600) {
    const b = hud.querySelector('.rl-banner');
    b.innerHTML = `<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`; b.hidden = false; b.classList.remove('out');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { b.classList.add('out'); setTimeout(() => { b.hidden = true; }, 400); }, ms);
  }
  const hudApi = {
    speed(kmh, gear = '') {
      const s = hud.querySelector('.rl-speed');
      if (kmh == null) { s.hidden = true; return; }
      s.hidden = false; s.querySelector('b').textContent = String(Math.round(Math.abs(kmh))); s.querySelector('i').textContent = gear || '';
    },
    seatHint(text) { const h = hud.querySelector('.rl-seathint'); if (!text) { h.hidden = true; return; } if (h.textContent !== text) h.textContent = text; h.hidden = false; },
    toast, banner,
    flagText(text) { S.flagOverride = text ?? null; drawFlag(); },
    show(v) { hud.hidden = !v; },
  };
  function nameOf(pid) { return S.names[pid] || (pid === S.net?.you ? me.get().name : 'Someone'); }
  function siteName(id) { return S.net?.room?.sites?.flags?.find(f => f.id === String(id))?.name || S.flagSites.find(f => f.id === id)?.name || S.sites?.flags?.find(f => String(f.id) === String(id))?.name || 'the flag site'; }
  function drawFlag() {
    const line = hud.querySelector('.rl-flagline'), box = hud.querySelector('.rl-flagbox');
    const room = S.net?.room;
    if (!room) return;
    let text;
    if (S.flagOverride) text = S.flagOverride;
    else if (room.mode === 'sandbox') text = 'Sandbox — drive anything';
    else if (!S.flag) text = 'Flag Run';
    else {
      const f = S.flag;
      text = f.state === 'site' ? `The flag is at ${siteName(f.site)}`
        : f.state === 'carried' ? (f.by === S.net.you ? 'You have the flag — bring it home!' : `${nameOf(f.by)} has the flag`)
        : f.state === 'dropped' ? 'The flag is on the ground — pick it up!'
        : f.state === 'captured' ? 'Flag home!' : 'Flag Run';
    }
    line.textContent = text;
    box.classList.toggle('carry', S.flag?.state === 'carried' && S.flag?.by === S.net?.you);
  }
  function drawClock() {
    const c = hud.querySelector('.rl-clock'), R = S.run, room = S.net?.room;
    if (!room || room.mode !== 'flag' || !R) { c.textContent = ''; return; }
    const best = R.best != null ? ` · best ${fmtTime(R.best)}` : '';
    if (R.phase === 'pick') c.textContent = `Drive out of home to start the clock${best}`;
    else if (R.phase === 'go') c.textContent = `${fmtTime(S.net.serverNow() - R.startedAt)}${best}`;
    else c.textContent = R.time != null ? `Time ${fmtTime(R.time)}${best}` : `Flag home${best}`;
    c.classList.toggle('live', R.phase === 'go');
  }

  // ------------------------------------------------------------------------------------------ the room's messages
  function bind(net) {
    net.on('room', m => {
      S.names = Object.fromEntries(m.players.map(p => [p.pid, p.name]));
      if (screen === 'lobby') { if (m.phase === 'play') enterGame(); else drawLobby(); }
      if (screen === 'game') { drawSpectate(); drawFlag(); }
    });
    net.on('flag', m => {
      const prev = S.flag; S.flag = m; drawFlag();
      if (screen !== 'game') return;
      if (m.state === 'carried' && prev?.state !== 'carried') banner(m.by === net.you ? 'You have the flag!' : `${nameOf(m.by)} has the flag`, m.by === net.you ? 'Get back in and drive it home.' : '');
      if (m.state === 'dropped' && prev?.state === 'carried') toast('The flag was dropped.');
    });
    net.on('run', m => {
      const prev = S.run; S.run = m;
      if (m.phase === 'go' && prev?.phase === 'pick' && screen === 'game') toast('The clock is running!');
      if (m.phase === 'done' && prev?.phase !== 'done' && m.time == null) { if (screen === 'game') banner('Flag home!', 'No time this run — the clock starts when you drive out of home.', 4000); }
      else if (m.phase === 'done' && prev?.phase !== 'done') {
        const best = m.best != null && m.time <= m.best;
        if (screen === 'game') banner(`Flag home in ${fmtTime(m.time)}`, best ? 'A new best time!' : `Best: ${fmtTime(m.best)}`, 5000);
        history.addRun({ seed: net.room?.seed, site: S.flag?.site, siteName: siteName(S.flag?.site), ms: m.time, best: m.best, online: net.online });
        tally('run_done', { mode: net.room?.mode, online: net.online });
      }
    });
    net.on('reset', () => { S.flagOverride = null; if (screen === 'game') banner('New run', 'Everything is back at home.'); });
    net.on('pin', m => { if (m.p) S.pins.set(m.pid, { pid: m.pid, x: m.p[0], z: m.p[1] }); else S.pins.delete(m.pid); });
    net.on('toast', m => toast(m.text));
    net.on('deny', m => { if (m.why) toast(m.why, 'deny'); });
    net.on('kicked', m => { endGame(false); message('Removed from the room', m.by === 'vote' ? 'The other players voted to remove you.' : 'The host removed you from the room.'); });
    net.on('err', m => { if (m.code === 'noroom') { endGame(false); message('Room closed', 'That room is not there any more.'); } });
    net.on('status', s => {
      document.body.dataset.net = s;
      hud.querySelector('.rl-netdot').className = 'rl-netdot ' + s;
      if (s === 'reconnecting' && screen === 'game') toast('Connection lost — getting your seat back…');
      if (s === 'online' && screen === 'game' && S.entered) toast('Back online.');
      if (s === 'closed' && S.net === net && (screen === 'game' || screen === 'lobby') && !S.leaving) { endGame(false); message('Disconnected', 'The connection to the room was lost.'); }
      if (screen === 'lobby') drawLobby();
    });
  }

  // ------------------------------------------------------------------------------------------ starting / joining / leaving
  let busy = false;
  function loading(text) {
    const node = el('div', 'rl-screen rl-loading', `<div class="rl-loadbox"><b>${esc(text)}</b><div class="rl-bar"><i></i></div><button class="rl-btn small" data-back>Cancel</button></div>`);
    const rec = layers.push(node, { kind: 'loading', onBack: () => { cancelled = true; rec.close(); endGame(false); } });
    let cancelled = false;
    node.querySelector('[data-back]').onclick = () => rec.onBack();
    rec.progress = f => { node.querySelector('.rl-bar i').style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%'; };
    rec.text = t => { node.querySelector('b').textContent = t; };
    Object.defineProperty(rec, 'cancelled', { get: () => cancelled });
    screen = 'loading';
    return rec;
  }
  async function playSolo(mode) {
    if (busy) return; busy = true;
    const L = loading('Building the world…');
    try {
      const seed = defaultSeed, w = (await prepare(seed, f => L.progress(f))) || {};
      if (L.cancelled) return;
      if (w.vehicles) vehicles = Array.isArray(w.vehicles) ? w.vehicles : w.vehicles.vehicles || vehicles;
      const cur = me.get(), flagId = store.get('roverlands.soloFlag', 'random');
      const net = await connect({ online: false, create: { mode, seed, flagId, start: true }, name: cur.name, look: cur.look, sites: w.sites || {}, vehicles: w.vehicles || vehicles });
      S.solo = true; S.spectate = false; S.online = false; useNet(net);
      L.close();
      enterGame({ prepared: true });
      tally('play_solo', { mode });
    } catch (e) { L.close(); console.error(e); message('Could not start', e?.message || 'Something went wrong.'); showTitle(); }
    finally { busy = false; }
  }
  async function goOnline({ create = null, code = null, spectate = false } = {}) {
    if (busy) return; busy = true;
    const L = loading(create ? 'Making a room…' : spectate ? `Joining room ${code} to watch…` : `Joining room ${code}…`);
    try {
      const cur = me.get();
      const net = await connect({ online: true, create, code, spectate, name: cur.name, look: cur.look });
      if (L.cancelled) { net.close(); return; }
      S.solo = false; S.spectate = spectate; S.online = true; useNet(net);
      L.close();
      try { const u = new URL(location.href); if (u.searchParams.has('code')) { u.searchParams.delete('code'); u.searchParams.delete('spectate'); history_replace(u); } } catch { /* fine */ }
      if (net.room.phase === 'play') enterGame(); else enterLobby();
      tally(create ? 'host' : spectate ? 'spectate' : 'join', create ? { mode: create.mode, public: !!create.public } : undefined);
    } catch (e) {
      L.close(); forgetRoom();
      message(create ? 'Could not make a room' : 'Could not join', e?.message || 'Something went wrong.');
      showTitle();
    } finally { busy = false; }
  }
  const history_replace = u => { try { window.history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); } catch { /* fine */ } };
  function useNet(net) {
    S.net = net; S.flag = null; S.run = null; S.pins.clear(); S.entered = false; S.leaving = false; S.flagOverride = null;
    S.names = Object.fromEntries((net.room?.players || []).map(p => [p.pid, p.name]));
    // what the room said while connect() was still settling (js/net/client.js net.last)
    S.flag = net.last?.flag || null; S.run = net.last?.run || null;
    for (const [pid, p] of Object.entries(net.last?.pins || {})) S.pins.set(+pid, { pid: +pid, x: p[0], z: p[1] });
    bind(net);
  }
  async function enterGame({ prepared = false } = {}) {
    const net = S.net; if (!net || S.entered) return;
    S.entered = true;
    if (!prepared) {
      const L = loading('Building the world…');
      try { await prepare(net.room.seed, f => L.progress(f)); } catch (e) { console.error(e); }
      L.close();
      if (S.net !== net) return;
    }
    layers.closeAll();
    screen = 'game'; hud.hidden = false;
    touch.show(isTouch() && !S.spectate);
    drawFlag(); drawSpectate();
    try { onGame(net, { solo: S.solo, spectate: S.spectate, mode: net.room.mode, seed: net.room.seed }); } catch (e) { console.error('[roverlands] onGame', e); }
    if (net.room.mode === 'flag' && !S.spectate) banner('Flag Run', `Grab the flag at ${siteName(net.room.flagId)} and bring it home.`, 4000);
    else if (!S.spectate) banner('Sandbox', 'Every vehicle is yours to try.', 3000);
  }
  function endGame(toTitle = true) {
    const net = S.net;
    S.leaving = true;
    if (net) { try { net.close(); } catch { /* closed */ } }
    const was = screen === 'game';
    S.net = null; S.entered = false; S.solo = false; S.spectate = false;
    hud.hidden = true; touch.show(false); rating.close();
    if (was) { try { onLeave(); } catch (e) { console.error('[roverlands] onLeave', e); } }
    showTitle();
    if (!toTitle) { /* the title is up either way; a message usually follows */ }
  }
  function leave() { endGame(true); }

  // ------------------------------------------------------------------------------------------ title
  let titleRec = null, online = false;
  serverAvailable().then(ok => { online = ok; if (screen === 'title') drawTitle(); });
  function showTitle() {
    layers.closeAll();
    screen = 'title'; hud.hidden = true;
    const node = el('div', 'rl-screen rl-title');
    titleRec = layers.push(node, { kind: 'title', onBack: () => {} });
    drawTitle();
  }
  function drawTitle() {
    if (!titleRec || titleRec.closed) return;
    const node = titleRec.el, cur = me.get(), soloMode = store.get('roverlands.soloMode', 'flag');
    node.innerHTML = `<div class="rl-title-wrap">
      <h1 class="rl-logo">Roverlands</h1>
      <p class="rl-tagline">Drive anywhere. Bring the flag home.</p>
      <div class="rl-panel rl-mecard"><img class="rl-face" src="${portrait(cur.look)}" alt="">
        <div class="rl-me"><label class="rl-lbl" for="rl-name">Your name</label><input id="rl-name" class="rl-input" maxlength="14" value="${esc(cur.name)}" autocomplete="off" data-nav="1">
        <button class="rl-btn small" data-look>Edit look</button></div></div>
      <div class="rl-play">
        <button class="rl-btn primary big" data-solo data-autofocus>Play solo</button>
        <div class="rl-chips" role="group" aria-label="Solo mode">${Object.entries(MODES).map(([id, m]) => `<button class="rl-pill small${soloMode === id ? ' on' : ''}" data-solomode="${id}">${m.name}</button>`).join('')}</div>
      </div>
      ${online ? `<div class="rl-online"><button class="rl-btn" data-host>Host</button><button class="rl-btn" data-join>Join</button><button class="rl-btn" data-find>Find a game</button></div>`
        : `<p class="rl-note center">Playing with friends needs the game's server — open the online link to host or join.</p>`}
      <div class="rl-small">${online ? '<button class="rl-btn small" data-spectate>Spectate</button>' : ''}<button class="rl-btn small" data-history>My runs</button><span class="rl-wn"></span><span class="rl-acct"></span></div>
    </div>`;
    const wn = news.button({ label: "What's new", className: 'rl-btn small' }); node.querySelector('.rl-wn').replaceWith(wn);
    node.querySelector('.rl-acct').replaceWith(acct.button('title'));
    const name = node.querySelector('#rl-name');
    name.addEventListener('change', () => { const n = name.value.replace(/[<>&"'`\\]/g, '').trim().slice(0, 14); if (n) me.set({ name: n }); else name.value = me.get().name; });
    name.addEventListener('keydown', e => { if (e.key === 'Enter') name.blur(); });
    node.onclick = e => {
      const t = e.target;
      if (t.closest('[data-solo]')) return playSolo(store.get('roverlands.soloMode', 'flag'));
      const sm = t.closest('[data-solomode]'); if (sm) { store.set('roverlands.soloMode', sm.dataset.solomode); return drawTitle(); }
      if (t.closest('[data-look]')) return editLook();
      if (t.closest('[data-host]')) return hostDialog();
      if (t.closest('[data-join]')) return joinDialog(false);
      if (t.closest('[data-find]')) return findDialog();
      if (t.closest('[data-spectate]')) return joinDialog(true);
      if (t.closest('[data-history]')) return openHistory({ layers, history, vehicleName });
    };
    attachNav();
  }
  async function editLook() { await openLookEditor({ layers, nav, me, account: acct }); if (screen === 'title') drawTitle(); if (screen === 'lobby') drawLobby(); }
  function hostDialog() {
    let mode = store.get('roverlands.hostMode', 'flag'), pub = store.get('roverlands.hostPublic', false), flagId = 'random';
    const rec = modal('', { kind: 'host' });
    const panel = rec.el.querySelector('.rl-panel');
    const draw = () => {
      panel.innerHTML = `<h2>Host a room</h2>
        <h3>Mode</h3><div class="rl-modes">${Object.entries(MODES).map(([id, m]) => `<button class="rl-mode${mode === id ? ' on' : ''}" data-mode="${id}"><b>${m.name}</b><span>${m.blurb}</span></button>`).join('')}</div>
        <h3>Who can join</h3><div class="rl-row"><button class="rl-pill${pub ? ' on' : ''}" data-pub="1">Public</button><button class="rl-pill${!pub ? ' on' : ''}" data-pub="0">Invite only</button></div>
        <p class="rl-note">${pub ? 'Anyone can find it in “Find a game”.' : 'Only people with the code or the link can join.'}</p>
        ${mode === 'flag' ? `<h3>Flag site</h3><div class="rl-row wrap"><button class="rl-pill${flagId === 'random' ? ' on' : ''}" data-flag="random">Random</button>${S.flagSites.map(f => `<button class="rl-pill${flagId === f.id ? ' on' : ''}" data-flag="${esc(f.id)}">${esc(f.name)}</button>`).join('')}</div>` : ''}
        <div class="rl-row end"><button class="rl-btn" data-x data-back>Cancel</button><button class="rl-btn primary" data-go>Make the room</button></div>`;
      attachNav();
    };
    panel.addEventListener('click', e => {
      const m = e.target.closest('[data-mode]'); if (m) { mode = m.dataset.mode; store.set('roverlands.hostMode', mode); return draw(); }
      const p = e.target.closest('[data-pub]'); if (p) { pub = p.dataset.pub === '1'; store.set('roverlands.hostPublic', pub); return draw(); }
      const f = e.target.closest('[data-flag]'); if (f) { flagId = f.dataset.flag; return draw(); }
      if (e.target.closest('[data-go]')) { rec.close(); goOnline({ create: { mode, public: pub, seed: defaultSeed, flagId } }); }
    });
    draw();
  }
  function joinDialog(spectate) {
    const rec = modal(`<h2>${spectate ? 'Watch a room' : 'Join a room'}</h2><p>Type the four letters shown on the host's screen.</p>
      <input class="rl-input rl-codein" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" data-nav="1">
      ${spectate ? '<p class="rl-note">You watch without a seat: follow any player, or look around freely.</p>' : ''}
      <p class="rl-err"></p><div class="rl-row end"><button class="rl-btn" data-x data-back>Cancel</button><button class="rl-btn primary" data-go>${spectate ? 'Watch' : 'Join'}</button></div>`, { kind: 'join' });
    const inp = rec.el.querySelector('.rl-codein'); setTimeout(() => inp.focus(), 30);
    const go = () => { const c = cleanCode(inp.value); if (!c) { rec.el.querySelector('.rl-err').textContent = 'That is four letters, like ABCD.'; return; } rec.close(); goOnline({ code: c, spectate }); };
    rec.el.querySelector('[data-go]').onclick = go;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    inp.addEventListener('input', () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z]/g, ''); });
  }
  function findDialog() {
    let timer = 0;
    const rec = modal(`<h2>Find a game</h2><div class="rl-rooms"><p class="rl-note">Looking…</p></div><div class="rl-row end"><button class="rl-btn" data-x data-back>Close</button></div>`, { kind: 'find', onBack: () => { clearInterval(timer); rec.close(); } });
    const box = rec.el.querySelector('.rl-rooms');
    const ask = async () => {
      const list = await listRooms(); if (rec.closed) return;
      box.innerHTML = list.length ? list.map(r => `<div class="rl-roomrow"><b class="rl-code">${esc(r.code)}</b><span>${esc(r.hostName ? r.hostName + "'s room" : 'A room')} · ${esc(MODES[r.mode]?.name || r.mode)}${r.site ? ' · ' + esc(r.site) : ''}<i>${r.players}/${r.seats} · ${r.phase === 'play' ? 'driving' : 'waiting'}</i></span><button class="rl-btn small primary" data-code="${esc(r.code)}">Join</button><button class="rl-btn small" data-watch="${esc(r.code)}">Watch</button></div>`).join('')
        : '<p class="rl-note">No public games right now. Host one and choose “Public”, or ask a friend for their code.</p>';
      attachNav();
    };
    box.addEventListener('click', e => {
      const j = e.target.closest('[data-code]'), w = e.target.closest('[data-watch]');
      if (j || w) { clearInterval(timer); rec.close(); goOnline({ code: (j || w).dataset.code || (j || w).dataset.watch, spectate: !!w }); }
    });
    ask(); timer = setInterval(ask, 3000);
  }
  /** An invite link on a device with no driver yet: name + look first, then straight in (one tap). */
  function inviteCard(code, spectate) {
    const cur = me.get();
    const rec = modal(`<h2>Join room ${esc(code)}</h2><div class="rl-mecard flat"><img class="rl-face" src="${portrait(cur.look)}" alt=""><div class="rl-me"><label class="rl-lbl" for="rl-iname">Your name</label><input id="rl-iname" class="rl-input" maxlength="14" value="${esc(cur.name)}" data-nav="1"><button class="rl-btn small" data-look>Edit look</button></div></div>
      <div class="rl-row end"><button class="rl-btn" data-x data-back>Not now</button><button class="rl-btn primary big" data-go data-autofocus>${spectate ? 'Watch' : 'Join'}</button></div>`, { kind: 'invite' });
    rec.el.addEventListener('click', async e => {
      if (e.target.closest('[data-look]')) { await editLook(); rec.el.querySelector('.rl-face').src = portrait(me.get().look); return; }
      if (e.target.closest('[data-go]')) { const n = rec.el.querySelector('#rl-iname').value.replace(/[<>&"'`\\]/g, '').trim().slice(0, 14); me.set(n ? { name: n } : {}); rec.close(); goOnline({ code, spectate }); }
    });
  }

  // ------------------------------------------------------------------------------------------ lobby
  let lobbyRec = null, qrFor = null, qrHtml = '';
  function enterLobby() {
    layers.closeAll();
    screen = 'lobby'; hud.hidden = true;
    lobbyRec = layers.push(el('div', 'rl-screen rl-lobby'), { kind: 'lobby', onBack: () => leave() });
    drawLobby();
  }
  async function qrOf(code) {
    if (qrFor === code) return qrHtml;
    qrFor = code; qrHtml = '';
    try { qrHtml = await qrSvg(joinUrl(code)); } catch { qrHtml = ''; }
    if (screen === 'lobby') drawLobby();
    return qrHtml;
  }
  function inviteBlock(room) {
    const link = joinUrl(room.code);
    return `<div class="rl-panel rl-invite"><button class="rl-qr" data-bigqr aria-label="Show the QR code big">${qrHtml || '<span class="rl-note">QR…</span>'}</button>
      <div class="rl-inv-text"><span class="rl-lbl">Room code</span><b class="rl-code big">${esc(room.code)}</b>
      <span class="rl-note">Scan the code with a phone, or share the link:</span><a class="rl-link" href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a>
      <div class="rl-row"><button class="rl-btn small" data-copy>Copy invite link</button><button class="rl-btn small" data-bigqr>Big QR</button></div></div></div>`;
  }
  function bigQr(code) {
    const rec = modal(`<div class="rl-bigqr">${qrHtml}</div><b class="rl-code huge">${esc(code)}</b><p class="rl-note center">${esc(joinUrl(code))}</p><div class="rl-row end"><button class="rl-btn primary" data-x data-back>Close</button></div>`, { kind: 'bigqr', cls: 'rl-qrmodal' });
    return rec;
  }
  function copyLink(code) { const link = joinUrl(code); (navigator.clipboard?.writeText(link) || Promise.reject()).then(() => toast('Invite link copied.'), () => { prompt('Copy this link:', link); }); }
  function drawLobby() {
    const room = S.net?.room; if (!room || !lobbyRec || lobbyRec.closed) return;
    if (qrFor !== room.code) qrOf(room.code);
    const amHost = room.host === room.you, node = lobbyRec.el;
    const drivers = room.players.filter(p => !p.spec), watchers = room.players.filter(p => p.spec);
    const row = p => `<div class="rl-prow${p.pid === room.you ? ' me' : ''}${p.on ? '' : ' away'}" style="--pc:${pinColor(p.pid)}"><img class="rl-face sm" src="${portrait(p.look)}" alt="">
      <span class="rl-pname"><b>${esc(p.name)}</b><i>${p.pid === room.host ? 'Host' : ''}${p.pid === room.you ? (p.pid === room.host ? ' · you' : 'You') : ''}${p.spec ? ' · watching' : ''}${p.on ? '' : ' · reconnecting…'}</i></span>
      ${p.pid === room.you ? '<button class="rl-btn small" data-look>Edit look</button>' : amHost ? `<button class="rl-btn small" data-kick="${p.pid}">Remove</button>` : `<button class="rl-btn small" data-vote="${p.pid}">Vote to remove${p.kick ? ` (${p.kick})` : ''}</button>`}</div>`;
    const ro = (label, on) => on ? `<span class="rl-pill on ro">${esc(label)}</span>` : '';
    const opt = (key, val, label, on) => amHost ? `<button class="rl-pill${on ? ' on' : ''}" data-opt="${key}" data-val="${esc(String(val))}">${esc(label)}</button>` : ro(label, on);
    const flags = room.sites?.flags || S.flagSites;
    node.innerHTML = `<div class="rl-lobby-wrap">
      <div class="rl-lobby-bar"><button class="rl-btn" data-leave data-back>‹ Leave</button><h2>Room <span class="rl-code">${esc(room.code)}</span>${S.net.status !== 'online' ? ' <i class="rl-badge">reconnecting…</i>' : ''}</h2></div>
      ${inviteBlock(room)}
      <div class="rl-panel"><h3>Drivers <span class="rl-note">${drivers.length}</span></h3><div class="rl-plist">${drivers.map(row).join('')}</div>
        ${watchers.length ? `<h3>Watching</h3><div class="rl-plist">${watchers.map(row).join('')}</div>` : ''}</div>
      <div class="rl-panel"><h3>Mode</h3><div class="rl-row wrap">${Object.entries(MODES).map(([id, m]) => opt('mode', id, m.name, room.mode === id)).join('')}</div>
        <p class="rl-note">${esc(MODES[room.mode]?.blurb || '')}</p>
        <h3>Who can join</h3><div class="rl-row wrap">${opt('public', true, 'Public', room.public)}${opt('public', false, 'Invite only', !room.public)}</div>
        ${room.mode === 'flag' ? `<h3>Flag site</h3><div class="rl-row wrap">${opt('flagId', 'random', 'Random', room.flagPick === 'random')}${flags.map(f => opt('flagId', f.id, f.name, room.flagPick === f.id)).join('')}</div>` : ''}
        ${amHost ? '' : '<p class="rl-note">The host picks these.</p>'}</div>
      <div class="rl-lobby-go">${amHost ? `<button class="rl-btn primary big" data-start data-autofocus>Start driving</button>` : `<span class="rl-wait">Waiting for the host to start…</span>`}</div>
    </div>`;
    node.onclick = e => {
      const t = e.target, net = S.net; if (!net) return;
      if (t.closest('[data-leave]')) return leave();
      if (t.closest('[data-start]')) return net.send({ t: 'start' });
      if (t.closest('[data-copy]')) return copyLink(room.code);
      if (t.closest('[data-bigqr]')) return bigQr(room.code);
      if (t.closest('[data-look]')) return editLook();
      const k = t.closest('[data-kick]'); if (k) return net.send({ t: 'kick', pid: +k.dataset.kick });
      const v = t.closest('[data-vote]'); if (v) { net.send({ t: 'votekick', pid: +v.dataset.vote }); return toast('Vote counted.'); }
      const o = t.closest('[data-opt]');
      if (o) { const key = o.dataset.opt, raw = o.dataset.val; return net.send({ t: 'opt', key, value: key === 'public' ? raw === 'true' : raw }); }
    };
    attachNav();
  }

  // ------------------------------------------------------------------------------------------ ☰ menu, settings, how to drive, invite
  function openMenu() {
    if (layers.find('menu')) return;
    const inGame = screen === 'game', room = S.net?.room, amHost = room && room.host === room.you;
    const items = [
      inGame || screen === 'lobby' ? ['resume', inGame ? 'Back to driving' : 'Back'] : ['resume', 'Back'],
      room && !S.solo ? ['invite', 'Invite friends'] : null,
      inGame ? ['map', 'Map'] : null,
      inGame && amHost && room.mode === 'flag' ? ['reset', 'New run'] : null,
      inGame && S.spectate && room ? ['play', 'Play instead of watching'] : null,
      ['howto', 'How to drive'], ['settings', 'Settings'], ['news', "What's new"], ['report', 'Report a bug'],
      acct.on ? ['signout', 'Sign out'] : (online ? ['signin', 'Sign in'] : null),
      inGame || screen === 'lobby' ? ['leave', inGame && S.solo ? 'Quit to title' : 'Leave room'] : null,
    ].filter(Boolean);
    const rec = modal(`<h2>Menu</h2>${room && !S.solo ? `<p class="rl-note">Room <b class="rl-code">${esc(room.code)}</b> · ${esc(MODES[room.mode]?.name || '')} · ${room.players.filter(p => !p.spec).length} driving</p>` : ''}
      <div class="rl-menu">${items.map(([id, label], i) => `<button class="rl-btn${i === 0 ? ' primary' : ''}${id === 'leave' ? ' danger' : ''}" data-m="${id}"${i === 0 ? ' data-autofocus data-back' : ''}>${esc(label)}</button>`).join('')}</div>`, { kind: 'menu', cls: 'rl-menumodal' });
    rec.el.addEventListener('click', e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      const id = b.dataset.m; rec.close();
      if (id === 'invite') return inviteModal();
      if (id === 'map') return openMap();
      if (id === 'reset') return S.net?.send({ t: 'reset' });
      if (id === 'play') { const code = room.code; endGame(false); return goOnline({ code }); }
      if (id === 'howto') return howTo();
      if (id === 'settings') return settingsModal();
      if (id === 'news') return news.open();
      if (id === 'report') return report.open();
      if (id === 'signin') return acct.openSignIn();
      if (id === 'signout') return acct.signOut();
      if (id === 'leave') return leave();
    });
  }
  function closeMenu() { layers.find('menu')?.close(); }
  function inviteModal() {
    const room = S.net?.room; if (!room) return;
    const rec = modal('<h2>Invite friends</h2><div class="rl-invslot"></div><div class="rl-row end"><button class="rl-btn primary" data-x data-back>Close</button></div>', { kind: 'invite' });
    const fill = () => { const slot = rec.el.querySelector('.rl-invslot'); if (slot) slot.innerHTML = inviteBlock(room); attachNav(); };
    qrOf(room.code).then(fill); fill();
    rec.el.addEventListener('click', e => { if (e.target.closest('[data-copy]')) copyLink(room.code); if (e.target.closest('[data-bigqr]')) bigQr(room.code); });
  }
  function howTo() {
    modal(`<h2>How to drive</h2>
      <table class="rl-table rl-controls"><tr><th></th><th>Keyboard + mouse</th><th>Controller</th><th>Phone</th></tr>
      ${CONTROLS.map(r => `<tr><th>${esc(r[0])}</th>${r.slice(1).map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>
      <p class="rl-note">Flag Run: drive out of home to start the clock, get out at the flag (it has to be on foot), get back in and drive it home. Crash an open vehicle hard and you may be thrown out.</p>
      <div class="rl-row end"><button class="rl-btn primary" data-x data-back>Got it</button></div>`, { kind: 'howto', cls: 'rl-wide' });
  }
  function settingsModal() {
    const rec = modal('', { kind: 'settings' });
    const panel = rec.el.querySelector('.rl-panel');
    const draw = () => {
      const s = settings.get();
      const range = (key, label, min, max, step) => `<label class="rl-setrow"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}" data-set="${key}"><b>${key === 'volume' ? Math.round(s[key] * 100) + '%' : (+s[key]).toFixed(1) + '×'}</b></label>`;
      panel.innerHTML = `<h2>Settings</h2>
        <h3>Graphics</h3><div class="rl-row wrap">${QUALITIES.map(([id, label]) => `<button class="rl-pill${s.quality === id ? ' on' : ''}" data-q="${id}">${label}</button>`).join('')}</div>
        ${range('volume', 'Sound', 0, 1, 0.05)}${range('mouseSens', 'Mouse / drag look speed', 0.3, 3, 0.1)}${range('padSens', 'Controller look speed', 0.3, 3, 0.1)}${range('camDist', 'Camera distance', 0.6, 1.8, 0.1)}
        <h3>Look up and down</h3><div class="rl-row"><button class="rl-pill${!s.invertY ? ' on' : ''}" data-inv="0">Normal</button><button class="rl-pill${s.invertY ? ' on' : ''}" data-inv="1">Inverted</button></div>
        <p class="rl-note">Saved on this device.</p><div class="rl-row end"><button class="rl-btn primary" data-x data-back>Done</button></div>`;
      attachNav();
    };
    panel.addEventListener('click', e => {
      const q = e.target.closest('[data-q]'); if (q) { settings.set({ quality: q.dataset.q }); return draw(); }
      const i = e.target.closest('[data-inv]'); if (i) { settings.set({ invertY: i.dataset.inv === '1' }); return draw(); }
    });
    panel.addEventListener('input', e => { const k = e.target.dataset.set; if (!k) return; settings.set({ [k]: +e.target.value }); const b = e.target.parentElement.querySelector('b'); if (b) b.textContent = k === 'volume' ? Math.round(+e.target.value * 100) + '%' : (+e.target.value).toFixed(1) + '×'; });
    draw();
  }

  // ------------------------------------------------------------------------------------------ maps + markers
  function markerData() {
    const M = S.markers || {}, room = S.net?.room, sites = S.sites || {};
    const out = { you: M.you || null, camDir: M.camDir || null, players: M.players || [], vehicles: M.vehicles || [], labels: sites.labels || [], pins: [...S.pins.values()] };
    if (sites.home) out.home = sites.home;
    if (room?.mode === 'flag') {
      const f = S.flag, siteId = f?.site ?? room.flagId, site = (sites.flags || []).find(x => String(x.id) === String(siteId));
      if (site) out.site = { x: site.x, z: site.z };
      if (f) {
        if (f.state === 'site' && site) out.flag = { x: site.x, z: site.z };
        else if (f.state === 'dropped' && f.p) out.flag = { x: f.p[0], z: f.p[2] };
        else if (f.state === 'carried') { const c = f.by === S.net.you ? M.you : (M.players || []).find(p => p.pid === f.by); if (c) out.flag = { x: c.x, z: c.z }; }
        else if (f.state === 'captured' && sites.home) out.flag = { x: sites.home.x, z: sites.home.z };
      } else if (site) out.flag = { x: site.x, z: site.z };
    }
    return out;
  }
  function openMap() {
    if (layers.find('map') || screen !== 'game') return;
    openMapScreen({ model, layers, getData: markerData, names: () => S.names, onPin: p => { S.net?.send({ t: 'pin', p }); if (S.solo || !S.net?.online) { /* the loopback answers too */ } } });
  }
  let spectIdx = -1;
  function drawSpectate() {
    const bar = hud.querySelector('.rl-spectate');
    if (!S.spectate || !S.net?.room) { bar.hidden = true; return; }
    const drivers = S.net.room.players.filter(p => !p.spec);
    const who = S.follow != null ? (drivers.find(p => p.pid === S.follow)?.name || '—') : 'Free camera';
    bar.hidden = false;
    bar.innerHTML = `<span class="rl-lbl">Watching</span><button class="rl-btn small" data-sp="-1" aria-label="Previous player">‹</button><b>${esc(who)}</b><button class="rl-btn small" data-sp="1" aria-label="Next player">›</button><button class="rl-btn small" data-sp="free">Free</button>`;
    bar.onclick = e => {
      const b = e.target.closest('[data-sp]'); if (!b) return;
      if (b.dataset.sp === 'free') { S.follow = null; spectIdx = -1; }
      else if (drivers.length) { spectIdx = (spectIdx + +b.dataset.sp + drivers.length) % drivers.length; S.follow = drivers[spectIdx].pid; }
      try { onFollow(S.follow); } catch (x) { console.error(x); }
      drawSpectate();
    };
  }

  // ------------------------------------------------------------------------------------------ the UI's own frame loop
  const padPrev = new Map(); let stickHeld = { dir: null, at: 0 };
  function padEdges() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const E = { up: false, down: false, left: false, right: false, a: false, b: false, x: false, y: false, start: false, back: false };
    const t = performance.now();
    for (const p of pads) {
      const b = p.buttons.map(x => !!x?.pressed), prev = padPrev.get(p.index) || b.map(() => true);   // first sight: nothing is "new"
      const ed = i => b[i] && !prev[i];
      if (ed(12)) E.up = true; if (ed(13)) E.down = true; if (ed(14)) E.left = true; if (ed(15)) E.right = true;
      if (ed(0)) E.a = true; if (ed(1)) E.b = true; if (ed(2)) E.x = true; if (ed(3)) E.y = true; if (ed(9)) E.start = true; if (ed(8)) E.back = true;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0, dir = Math.abs(ax) > 0.6 ? (ax > 0 ? 'right' : 'left') : Math.abs(ay) > 0.6 ? (ay > 0 ? 'down' : 'up') : null;
      if (dir && (stickHeld.dir !== dir || t - stickHeld.at > 260)) { E[dir] = true; stickHeld = { dir, at: t }; } else if (!dir && stickHeld.dir) stickHeld = { dir: null, at: 0 };
      padPrev.set(p.index, b);
    }
    return E;
  }
  let lastFrame = performance.now(), lastClock = 0;
  function frame() {
    const t = performance.now(); lastFrame = t;
    const E = padEdges(), top = layers.top();
    if (top && !top.ownPad && (E.up || E.down || E.left || E.right || E.a || E.b || E.x || E.y || E.start || E.back)) {
      if (top.onEdges && top.onEdges(E)) { /* the layer took them */ }
      else if (E.start && top.kind === 'menu') top.onBack?.();
      else if (!nav.handle(E) && E.b) top.onBack?.();
    } else if (!top && screen === 'game') {
      if (E.start) openMenu(); else if (E.back) openMap();
    }
    if (screen === 'game') {
      if (t - lastClock > 90) { drawClock(); lastClock = t; }
      minimap.draw(markerData(), S.names);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // keyboard: while a layer is up the arrows / Enter move the focus ring and Esc goes back — and the game never sees them
  addEventListener('keydown', e => {
    const top = layers.top();
    const typing = e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox';
    if (!top) {
      if (screen === 'game' && !typing) {
        if (e.code === 'Escape') { openMenu(); e.stopImmediatePropagation(); e.preventDefault(); }
        else if (e.code === 'KeyM') { openMap(); e.stopImmediatePropagation(); }
      }
      return;
    }
    if (top.foreign) { if (e.code === 'Escape') { /* the dialog closes itself */ } return; }
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); top.onBack?.(); return; }
    if (top.ownPad || typing) return;            // the map reads its own keys; typing goes to the box (the game is blocked anyway)
    const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
    if (map[e.code]) { if (top.onEdges?.({ [map[e.code]]: true })) { e.preventDefault(); } else if (nav.handle({ [map[e.code]]: true })) e.preventDefault(); e.stopImmediatePropagation(); return; }
    if ((e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') && nav.current && !e.target.closest?.('button')) { e.preventDefault(); nav.current.click(); e.stopImmediatePropagation(); return; }
    e.stopImmediatePropagation();
  }, true);
  // a player who sleeps their phone: the line comes back by itself (js/net/client.js); nothing to do here

  // ------------------------------------------------------------------------------------------ boot
  lookReady.then(() => { if (screen === 'title') drawTitle(); if (screen === 'lobby') drawLobby(); });
  (async () => {
    const q = new URLSearchParams(location.search), code = cleanCode(q.get('code')), spectate = q.get('spectate') === '1';
    showTitle();
    if (code) { await serverAvailable(); if (me.isNew) inviteCard(code, spectate); else goOnline({ code, spectate }); return; }
    const back = lastRoom();
    if (back?.code && await serverAvailable()) goOnline({ code: back.code, spectate: !!back.spectate });
  })();
  tally('page_view', { device: isTouch() ? 'touch' : 'desktop' });

  const ui = {
    hud: hudApi, touch: { mode: m => touch.mode(m), show: v => touch.show(v) },
    touchState: () => touch.state(),
    settings: () => settings.get(), onSettings: f => settings.on(f), setSetting: patch => settings.set(patch),
    setFlagSites(list) { S.flagSites = (list || []).map(f => ({ id: String(f.id), name: f.name || String(f.id) })); },
    setWorld({ size, sites, mapImage, flipZ, labels } = {}) { model.set({ size, image: mapImage, flipZ }); if (sites) { S.sites = { ...sites, labels: labels || sites.labels || [] }; if (!S.flagSites.length && sites.flags) ui.setFlagSites(sites.flags); } },
    setVehicles(v) { vehicles = Array.isArray(v) ? v : v?.vehicles || vehicles; },
    markers(m) { S.markers = m || {}; },
    vehicleLeft: (kind, secs) => (S.spectate ? false : rating.vehicleLeft(kind, secs)),
    openMenu, closeMenu, openMap, showTitle, leave, toast,
    blocking: () => layers.blocking() || performance.now() - lastClosed < 250,
    get screen() { return screen; }, get net() { return S.net; }, me: () => me.get(),
    state: () => ({ screen, layers: layers.stack.map(l => l.kind), room: S.net?.room ? { code: S.net.room.code, phase: S.net.room.phase, mode: S.net.room.mode, you: S.net.you, host: S.net.room.host, players: S.net.room.players.map(p => ({ pid: p.pid, name: p.name, spec: !!p.spec })) } : null, flag: S.flag, run: S.run, net: S.net?.status || null, touch: touch.shown }),
    // tests + debugging
    _layers: layers, _nav: nav, playSolo, goOnline,
  };
  return ui;
}
