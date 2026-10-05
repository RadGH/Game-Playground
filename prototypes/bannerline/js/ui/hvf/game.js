// Hunters vs Farmers — the playable mode on screen (stream H). One module owns a whole HvF session:
// the setup card (local seats + devices, or an online room), the match (sim + clock + forest + actors
// + one HUD and one camera per local player), the results, and back.
//
//   const hvf = createHvfGame({ gfx, data, host, devices, onExit, params });
//   hvf.openSetup();            // main.js calls this when the mode card is Hunters vs Farmers
//   hvf.start({ seats: [{ role, device }], format, seed, ai, speed, headStart });   // local match
//   hvf.online.host(code, opts) / hvf.online.join(code, opts)   // online room (stream D transport + lockstep)
//   hvf.frame(dt);              // every animation frame while hvf.active
//   hvf.end();                  // back out (restores the scene and viewports it borrowed)
//
// Reuses stream B's renderer (gfx), RTS camera, device layer (keyboard + gamepads, bindings.json) and
// menu nav; stream A's createSim + local clock; stream D's net clock + beginMatch. Draws with
// js/view/hvf/{world,actors}.js; DOM in js/ui/hvf/hud.js (css/hvf.css).
//
// SPLIT SCREEN: up to two local seats, side by side. Each half has its own camera, HUD and fog (the
// fog texture and what is drawn are swapped per viewport), so a farmer and a hunter may share a couch
// ("Both screens are visible — no peeking").
//
// Keyboard + mouse: right-click = the useful thing at the point (move / chop / attack / revive / pull
// up), 1-9 0 - = pick a building (farmer) or use an item (hunter), Q W E R abilities (aimed ones:
// then left-click), G army (farmer), L lodge / B shop (hunter), arrows + screen edge pan, wheel zoom,
// Space recentres, Esc cancels / pauses.
// Gamepad: left stick walks, right stick moves the aim ring, A = the useful thing at the ring (or
// place / cast), X Y B RT = Q W E R (B cancels while placing), d-pad down = the build menu (farmer:
// buildings, upgrades, army; hunter: skills, lodge, shop, pack) driven by d-pad / stick + A, B closes,
// d-pad up = send the army (farmer) / place a lodge (hunter), View = shop (hunter), d-pad left / right
// = use the first / second usable item (hunter), L3 recentres, Menu pauses.

import { createRtsCamera } from '../../view/camera.js';
import { createLocalClock } from '../../clock.js';
import { createSim, restoreSim, TICK_MS } from '../../sim/sim.js';
import { createHvfWorld, groundY } from '../../view/hvf/world.js';
import { createHvfActors } from '../../view/hvf/actors.js';
import { loadHvfModels } from '../../view/hvf/models.js';
import { createIconLibrary } from '../../view/icons.js';
import { createHvfSound } from '../../view/hvf-sound.js';
import { createHvfHud, REASONS } from './hud.js';
import { createMenuNav } from '../menunav.js';
import * as Q from '../../sim/modes/hvf/query.js';
import { KIND } from '../../sim/modes/hvf/mapgen.js';
import { cellOf, liveGrid } from '../../sim/modes/hvf/grid.js';
import { hvfRoomMode } from './online.js';

const BUILD_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];
const AI_LEVELS = [['recruit', 'Recruit'], ['veteran', 'Veteran'], ['commander', 'Commander']];
const PAD_KEYS = { Q: 'X', W: 'Y', E: 'B', R: 'RT' };
const SEAT_COL = ['#f2c45a', '#7fd0ff'];

export function createHvfGame({ gfx, data, host, devices = null, onExit = () => {}, params = new URLSearchParams(), transportKind = null }) {
  const THREE = gfx.THREE;
  const rules = data.hvf.rules;
  let m = null;                  // the running match
  let setup = null;              // the setup card { el, nav, seats }
  let models = null;             // stream C's art (js/view/hvf/models.js), loaded in the background; stand-ins until then
  let icons = null;   // stream C's baked icons (assets/icons/hvf-*), shown on the build bar, shop and pack
  const ready = Promise.all([
    params.get('models') !== '0' ? loadHvfModels().then((x) => { models = x; }) : null,
    createIconLibrary().then((x) => { icons = x; }).catch(() => {}),
  ]);
  const choice = { format: rules.defaultFormat, ai: 'veteran', speed: 1, seed: null, seats: [{ role: 'farmer', device: null }] };
  const devLabel = (id) => (!id ? 'press A / Enter to join' : id === 'kbm' ? 'Keyboard + mouse' : (devices?.get(id)?.label || 'Controller'));

  // ── setup card ─────────────────────────────────────────────────────────────────────────────────
  function openSetup() {
    end();
    closeSetup();
    const el = document.createElement('div');
    el.className = 'hvf-setup';
    host.append(el);
    host.hidden = false;
    devices?.releaseAll?.();
    setup = { el, nav: null, tab: 'local', online: null };
    drawSetup();
  }
  function seatRow(s, i) {
    return `<div class="seat" style="--seat:${SEAT_COL[i]}"><b>Player ${i + 1}</b>
      <span class="dev">${devLabel(s.device)}</span>
      <button class="mini ${s.role === 'farmer' ? 'on' : ''}" data-seat="${i}" data-role="farmer">🌾 Farmer</button>
      <button class="mini ${s.role === 'hunter' ? 'on' : ''}" data-seat="${i}" data-role="hunter">🏹 Hunter</button>
      ${i > 0 ? `<button class="mini" data-act="drop" data-seat="${i}">Remove</button>` : ''}</div>`;
  }
  function drawSetup() {
    if (!setup) return;
    const f = rules.formats[choice.format];
    const roles = new Set(choice.seats.map((s) => s.role));
    const tooMany = (r) => choice.seats.filter((s) => s.role === r).length > (r === 'farmer' ? f.farmers : f.hunters);
    setup.el.innerHTML = `<div class="card" data-ui>
      <header><button class="back" data-act="back">‹ Modes</button><h1>${rules.title}</h1><p>${rules.subtitle}</p></header>
      <div class="tabs"><button class="tab ${setup.tab === 'local' ? 'on' : ''}" data-tab="local">On this computer</button><button class="tab ${setup.tab === 'online' ? 'on' : ''}" data-tab="online">Online</button></div>
      ${setup.tab === 'local' ? `
      <div class="roles-help"><span><b>🌾 Farmer</b> — slip away, find a hidden hollow, raise animals for gold, wall the door, later send scarecrows. Cannot attack.</span>
        <span><b>🏹 Hunter</b> — wait out the head start, then track the farmers by their animals: listen, follow strays, plant watchstones, build lodges.</span></div>
      <h3>Players</h3>
      <div class="seats">${choice.seats.map(seatRow).join('')}
        ${choice.seats.length < 2 ? '<div class="seat add"><b>Player 2</b><span class="dev">press A on a second controller (or Enter) to join · split screen</span></div>' : ''}</div>
      ${roles.size > 1 ? '<p class="peek">Both screens are visible — no peeking!</p>' : ''}
      ${['farmer', 'hunter'].some(tooMany) ? `<p class="warn">${choice.format} has room for ${f.farmers} farmer(s) and ${f.hunters} hunter(s).</p>` : ''}` : onlineHtml()}
      <div class="row"><label>Format <select data-k="format">${Object.keys(rules.formats).map((k) => `<option value="${k}" ${k === choice.format ? 'selected' : ''}>${k} — ${rules.formats[k].farmers} farmers v ${rules.formats[k].hunters} hunter${rules.formats[k].hunters > 1 ? 's' : ''}</option>`).join('')}</select></label>
        <label>AI <select data-k="ai">${AI_LEVELS.map(([v, n]) => `<option value="${v}" ${v === choice.ai ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        ${setup.tab === 'local' ? `<label>Speed <select data-k="speed">${[[1, 'Normal'], [2, 'Fast ×2'], [4, 'Faster ×4']].map(([v, n]) => `<option value="${v}" ${v === choice.speed ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}
        <label>Seed <input data-k="seed" type="number" placeholder="random" value="${choice.seed ?? ''}"></label></div>
      <p class="info">${f.size} m forest · head start ${f.headStart} s · ${Math.round(f.clock / 60)} min clock · empty seats are AI. <a href="hvf-map.html?format=${choice.format}" target="_blank">Preview forests</a></p>
      ${setup.tab === 'local' ? `<button class="start" data-act="start" ${['farmer', 'hunter'].some(tooMany) ? 'disabled' : ''}>Start the hunt</button>` : ''}
      <p class="hint"><kbd>Enter</kbd> / <kbd class="pad">A</kbd> joins and chooses · d-pad / arrows move · <kbd>Esc</kbd> / <kbd class="pad">B</kbd> back</p>
    </div>`;
    setup.nav?.destroy();
    setup.nav = createMenuNav(setup.el, { selector: 'button:not([disabled]), select, input', onBack: () => { closeSetup(); onExit(); }, initial: setup.tab === 'local' ? '.start' : null });
  }
  function onlineHtml() {
    const o = setup.online;
    if (!o || !o.room) {
      return `<h3>Online</h3><div class="row"><button class="mini wide" data-act="host">Host a room</button>
        <label>Room code <input data-k="code" maxlength="5" placeholder="ABCDE" value="${o?.code || ''}"></label><button class="mini wide" data-act="join">Join</button></div>
        ${o?.error ? `<p class="warn">${o.error}</p>` : ''}<p class="info">Friends join with the code. Co-op works too: take three farmer seats, leave the hunters to the AI.</p>`;
    }
    const st = o.room.state;
    if (!st) return '<p class="info">Connecting…</p>';
    const mine = (s) => s.kind === 'human' && s.owner === o.room.me;
    return `<h3>Room <b class="code">${st.code}</b> <small>${o.room.isHost ? 'you host' : 'joined'} · ${st.machines.length} machine(s)</small></h3>
      <div class="seats">${st.slots.map((s) => `<div class="seat ${mine(s) ? 'me' : ''}"><b>${s.role === 'farmer' ? '🌾' : '🏹'} ${s.role} ${s.index + 1}</b>
        <span class="dev">${s.kind === 'human' ? `${s.name}${s.ready ? ' ✓ ready' : ''}` : s.kind === 'ai' ? `AI (${s.difficulty})` : 'open'}</span>
        ${mine(s) ? `<button class="mini" data-act="ready" data-key="${s.key}">${s.ready ? 'Not ready' : 'Ready'}</button><button class="mini" data-act="release" data-key="${s.key}">Leave seat</button>` : s.kind !== 'human' ? `<button class="mini" data-act="claim" data-key="${s.key}">Take</button>` : ''}</div>`).join('')}</div>
      ${o.error ? `<p class="warn">${o.error}</p>` : ''}
      ${o.room.isHost ? '<button class="start" data-act="netstart">Start the hunt</button>' : '<p class="info">Waiting for the host to start.</p>'}`;
  }
  async function onlineAct(act, el) {
    const o = setup.online || (setup.online = {});
    o.error = null;
    try {
      if (act === 'host') await api.online.host(null, { format: choice.format });
      else if (act === 'join') await api.online.join(setup.el.querySelector('[data-k="code"]').value);
      else if (act === 'claim') api.online.claim(el.dataset.key);
      else if (act === 'release') o.room.release(el.dataset.key);
      else if (act === 'ready') { const s = o.room.state.slots.find((x) => x.key === el.dataset.key); o.room.ready(el.dataset.key, !s.ready); }
      else if (act === 'netstart') api.online.start({ seed: choice.seed });
    } catch (err) { o.error = err.message || String(err); }
    drawSetup();
  }
  function setupClick(e) {
    if (!setup) return;
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.tab) { setup.tab = t.dataset.tab; drawSetup(); return; }
    if (t.dataset.role) { choice.seats[Number(t.dataset.seat)].role = t.dataset.role; drawSetup(); return; }
    const act = t.dataset.act;
    if (act === 'back') { closeSetup(); onExit(); }
    else if (act === 'drop') { const s = choice.seats.splice(Number(t.dataset.seat), 1)[0]; if (s?.device) devices?.release?.('hvf' + t.dataset.seat); drawSetup(); }
    else if (act === 'start') { readInputs(); if (!choice.seats[0].device) choice.seats[0].device = 'kbm'; const o = { ...choice, seats: choice.seats.map((s) => ({ ...s })) }; closeSetup(); start(o); }
    else if (act) onlineAct(act, t);
  }
  function readInputs() {
    const sd = setup?.el.querySelector('[data-k="seed"]')?.value;
    if (sd != null) choice.seed = sd === '' ? null : Number(sd) >>> 0;
  }
  function setupChange(e) {
    const k = e.target.dataset?.k; if (!k || k === 'code' || k === 'seed') return;
    if (k === 'format') { choice.format = e.target.value; setup.online?.room?.isHost && setup.online.room.configure({ format: choice.format }); }
    if (k === 'ai') choice.ai = e.target.value;
    if (k === 'speed') choice.speed = Number(e.target.value);
    drawSetup();
  }
  host.addEventListener('click', (e) => { if (setup && setup.el.contains(e.target)) setupClick(e); });
  host.addEventListener('change', (e) => { if (setup && setup.el.contains(e.target)) setupChange(e); });
  function setupFrame(frames) {
    if (!frames) return;
    // a device pressing its join action takes the next seat (seat 1 first, then a second player)
    for (const [id, f] of frames) {
      if (!f.pressed.has('join') || choice.seats.some((s) => s.device === id)) continue;
      if (setup.tab !== 'local') continue;
      if (!choice.seats[0].device) { choice.seats[0].device = id; setup.skip = true; drawSetup(); }
      else if (choice.seats.length < 2 && id !== 'kbm' || (choice.seats.length < 2 && id === 'kbm' && choice.seats[0].device !== 'kbm')) {
        const used = choice.seats[0].role;
        choice.seats.push({ role: used === 'farmer' ? 'hunter' : 'farmer', device: id }); setup.skip = true; drawSetup();
      }
    }
    if (setup.skip) { setup.skip = false; return; }   // the join press is not also a click
    const driver = choice.seats[0].device;
    for (const [id, f] of frames) if (!driver || id === driver || id !== 'kbm') { if (setup.nav.handle(f)) break; }
  }
  function closeSetup() { if (!setup) return; setup.nav?.destroy(); setup.el.remove(); setup = null; }

  // ── match ────────────────────────────────────────────────────────────────────────────────────────
  /** Local match. opts.seats = [{ role, device }] (1-2), or opts.role for a single seat. */
  function start(opts = {}) {
    end(); closeSetup();
    const o = { ...choice, ...opts };
    if (!opts.seats) o.seats = [{ role: opts.role || 'farmer', device: opts.device || 'kbm' }];
    const f = rules.formats[o.format];
    const seed = o.seed != null ? o.seed >>> 0 : (Number(params.get('seed')) >>> 0) || ((Math.random() * 0xffffffff) >>> 0);
    const players = [];
    for (let i = 0; i < f.farmers; i++) players.push({ role: 'farmer', kind: 'ai', ai: { difficulty: o.ai }, name: `Farmer ${i + 1}`, colour: i });
    for (let i = 0; i < f.hunters; i++) players.push({ role: 'hunter', kind: 'ai', ai: { difficulty: o.ai }, name: `Hunter ${i + 1}` });
    const local = [];
    o.seats.slice(0, 2).forEach((s, i) => {
      const pid = players.findIndex((p, k) => p.role === s.role && p.kind === 'ai' && !local.some((l) => l.player === k));
      if (pid < 0) return;
      Object.assign(players[pid], { kind: 'human', name: o.seats.length > 1 ? `Player ${i + 1}` : 'You' });
      delete players[pid].ai;
      local.push({ player: pid, device: s.device || 'kbm', slot: i });
    });
    const sim = createSim({ mode: 'hvf', format: o.format, seed, players, rules: o.headStart != null ? { headStart: o.headStart } : {} }, data);
    const clock = createLocalClock({ sim, tickMs: TICK_MS, speed: Number(params.get('speed')) || o.speed || 1 });
    return begin({ sim, clock, local, opts: o, net: null });
  }

  /** Shared by local and online: build the scene, the views and the input for a running sim. */
  function begin({ sim, clock, local, opts, net }) {
    const scene = gfx.scene;
    const hidden = [];
    for (const c of scene.children) if (!c.isLight && c.visible) { c.visible = false; hidden.push(c); }
    const sceneWas = { background: scene.background, fog: scene.fog };
    scene.background = new THREE.Color(0x1d2620);
    scene.fog = new THREE.Fog(0x25302a, 90, 260);
    const vpsWas = gfx.viewports.slice();
    for (const v of vpsWas) gfx.removeViewport(v);
    const simNow = () => (net ? net.clock.sim || sim : sim);
    const world = createHvfWorld(scene, sim.map);
    const actors = createHvfActors({ scene, map: sim.map, data, fogify: world.fogify, localTeam: sim.state.players[local[0].player].team, models });
    host.hidden = false;
    m = { get sim() { return simNow(); }, map: sim.map, net, clock, world, actors, views: [], opts, hidden, sceneWas, vpsWas, queue: [], over: false, overT: 1.5, paused: false, frameDt: 0, lastFogTick: -1 };
    const n = local.length;
    for (const l of local) m.views.push(makeView(l, n));
    // seat 0 shortcuts (tests, tools)
    m.me = m.views[0].player; m.camera = m.views[0].camera; m.vp = m.views[0].vp;
    if (n > 1 && new Set(m.views.map((v) => v.team)).size > 1) for (const v of m.views) v.hud.alert('Both screens are visible — no peeking!', 'warn', 5000);
    for (const v of m.views) {
      devices?.claim?.(v.device, 'hvf' + v.i);
      const f = rules.formats[sim.state.format];
      v.hud.alert(v.role === 'farmer' ? `Find a hidden spot before the hunters are loose (${f.headStart} s). Hollows are off the trails behind briar or a single tree.` : `You wait in your kennel for ${f.headStart} s while the farmers hide. Listen for their animals.`, 'info', 7000);
    }
    bindKbm();
    // sound (stream C's bridge, js/view/hvf-sound.js): one listener per screen — the nearest local character
    // (or camera) is the ear, and a spot counts as seen if either half's team sees it
    const mm = m;
    createHvfSound({
      localPlayers: m.views.map((v) => v.player),
      roleOf: (pid) => mm.sim.state.players[pid].role,
      ears: () => mm.views.map((v) => { const e = charOf(v); return e && e.alive ? { x: e.x, z: e.z } : { x: v.camera.target.x, z: v.camera.target.z }; }),
      visible: (x, z) => mm.views.some((v) => Q.visibleAt(mm.sim, v.team, x, z)),
      entOf: (id) => mm.sim.state.ents.find((e) => e.id === id) || null,
    }).then((snd) => { if (m === mm) { mm.sound = snd; for (const v of mm.views) v.hud.setSound?.(snd); } else snd.dispose(); }).catch((err) => console.warn('hvf sound unavailable', err));
    m.unlock = () => { mm.sound?.unlock(); };
    host.addEventListener('pointerdown', m.unlock); window.addEventListener('keydown', m.unlock);
    window.hvf = api;
    return m;
  }

  function makeView(l, n) {
    const sim = m.sim, i = l.slot ?? m.views.length;
    const player = l.player, p = sim.state.players[player];
    const isPad = l.device !== 'kbm';
    const camera = createRtsCamera();
    camera.setBounds({ x0: 4, x1: sim.map.size - 4, z0: 4, z1: sim.map.size - 4 });
    const v = { i, player, device: l.device, isPad, role: p.role, team: p.team, camera, placing: null, aim: null, ghost: null, cursor: { dx: 0, dz: 6 }, ground: null, bars: new Map(), menuOpen: false, moving: false, moveAt: 0 };
    v.vp = {
      id: 'hvf' + i, camera: camera.camera, rect: { x: 0, y: 0, w: 1, h: 1 },
      layout(size) { const w = n === 1 ? size.w : Math.floor(size.w / n); this.rect = { x: i * w, y: 0, w: i === n - 1 ? size.w - w * i : w, h: size.h }; },
      beforeRender: () => drawFor(v),
    };
    gfx.addViewport(v.vp);
    v.root = document.createElement('div');
    v.root.className = 'hvf-root' + (n > 1 ? ' split' : '') + (isPad ? ' pad-view' : ' kbm-view');
    v.root.style.setProperty('--seat', SEAT_COL[i]);
    host.append(v.root);
    v.overlay = document.createElement('div'); v.overlay.className = 'hvf-overlay'; v.root.append(v.overlay);
    if (n > 1) { const tag = document.createElement('div'); tag.className = 'hv-seat'; tag.textContent = `Player ${i + 1} · ${p.role}`; v.root.append(tag); }
    v.hud = createHvfHud({
      root: v.root, sim, player,
      keyLabel: (k) => (isPad ? PAD_KEYS[k] || k : k),
      iconUrl: (kind, id) => icons?.url(kind, id) || null,
      onCmd: (c) => issue(v, c),
      onPlace: (kind) => { setPlacing(v, kind); closeMenu(v); },
      onAim: (spec) => { setAim(v, spec); if (spec.skill || spec.lodge || spec.army || spec.use) closeMenu(v); },
      onMinimap: ({ x, z, button }) => { if (button === 2) issue(v, { type: 'move', x, z }); else camera.lookAt(x, z); },
      getCamBox: () => cameraBox(v),
    });
    if (isPad) {
      v.cursorEl = document.createElement('div'); v.cursorEl.className = 'hv-cursor'; v.overlay.append(v.cursorEl);
      v.nav = createMenuNav(v.hud.el, { selector: '.hv-main button, .hv-shop button', onBack: () => closeMenu(v) });
      v.nav.enabled = false;
      const leg = document.createElement('div'); leg.className = 'hv-padlegend';
      leg.innerHTML = p.role === 'farmer'
        ? '<kbd class="pad">LS</kbd> walk · <kbd class="pad">RS</kbd> aim ring · <kbd class="pad">A</kbd> act / place · <kbd class="pad">↓</kbd> build menu · <kbd class="pad">↑</kbd> send army · <kbd class="pad">X</kbd><kbd class="pad">Y</kbd><kbd class="pad">B</kbd> Scamper · Lie Low · Bell · <kbd class="pad">Menu</kbd> pause'
        : '<kbd class="pad">LS</kbd> walk · <kbd class="pad">RS</kbd> aim ring · <kbd class="pad">A</kbd> attack / act · <kbd class="pad">X</kbd><kbd class="pad">Y</kbd><kbd class="pad">B</kbd><kbd class="pad">RT</kbd> skills · <kbd class="pad">↓</kbd> menu · <kbd class="pad">View</kbd> shop · <kbd class="pad">↑</kbd> lodge · <kbd class="pad">←</kbd><kbd class="pad">→</kbd> items';
      v.root.append(leg);
    }
    const e = charOf(v);
    camera.snapTo(e.x, e.z);
    return v;
  }
  const charOf = (v) => m.sim.state.ents.find((e) => e.id === m.sim.state.players[v.player].ent);
  function issue(v, c) { if (m && !m.over) m.queue.push({ p: v.player, ...c }); }

  function setPlacing(v, kind) {
    if (v.ghost) { m.world.group.remove(v.ghost); v.ghost = null; }
    v.aim = null;
    v.placing = kind;
    if (kind) { v.ghost = m.actors.ghostFor(kind); m.world.group.add(v.ghost); }
    v.hud.setPlaceHint(kind ? ' ' : null);
  }
  function setAim(v, spec) {
    setPlacing(v, null);
    if (spec.skill && (v.role === 'farmer' || spec.skill === 'R')) { issue(v, { type: 'cast', slot: spec.skill }); return; }
    v.aim = spec;
    const what = spec.skill ? data.hvf.hunter.skills[spec.skill].name : spec.lodge ? 'Lodge' : spec.army ? 'Send the army' : spec.use === 'ward' ? 'Watchstone' : spec.use === 'flare' ? 'Flare' : '';
    v.hud.setPlaceHint(`<b>${what}</b>: ${v.isPad ? 'aim with the right stick, <kbd class="pad">A</kbd> to confirm · <kbd class="pad">B</kbd> cancels' : 'left-click a point · right-click / Esc cancels'}`);
  }
  function cancel(v) { setPlacing(v, null); v.aim = null; v.hud.setPlaceHint(null); }
  function fireAim(v, x, z) {
    const a = v.aim; if (!a) return;
    if (a.skill) issue(v, { type: 'cast', slot: a.skill, x, z });
    else if (a.lodge) issue(v, { type: 'lodge', x, z });
    else if (a.use) issue(v, { type: 'use', slot: a.slot, x, z });
    else if (a.army) {
      const ids = m.sim.state.ents.filter((e) => e.kind === 'army' && e.owner === v.player && e.alive).map((e) => e.id);
      if (ids.length) issue(v, { type: 'order', ids, kind: 'amove', x, z }); else v.hud.alert('No army yet — build a Harvest Hall', 'warn', 1600);
    }
    v.aim = null; v.hud.setPlaceHint(null);
  }
  /** The useful thing at a point (right-click / pad A). */
  function smartAct(v, x, z) {
    const s = m.sim.state, map = m.map;
    const vis = (e) => Q.visibleEnt(m.sim, v.team, e);
    if (v.role === 'hunter') {
      const t = m.actors.pick(s, x, z, (e) => e.team === 0 && vis(e));
      if (t) { issue(v, { type: 'attack', target: t.id }); marker(v, x, z, 'attack'); return; }
    } else {
      const g = s.hvf.graves.find((gr) => gr.pid !== v.player && Math.hypot(gr.x - x, gr.z - z) < 1.8);
      if (g) { issue(v, { type: 'revive', target: g.pid }); marker(v, x, z, 'revive'); return; }
      const w = m.actors.pick(s, x, z, (e) => (e.kind === 'ward' || e.kind === 'snare') && vis(e));
      if (w) { issue(v, { type: 'pullup', target: w.id }); marker(v, x, z, 'revive'); return; }
    }
    const c = cellOf(map, x, z), k = liveGrid({ state: s, map }).cells[c];
    if (k === KIND.tree || (k === KIND.briar && v.role === 'hunter')) { issue(v, { type: 'chop', cell: c }); marker(v, x, z, 'chop'); return; }
    issue(v, { type: 'move', x, z }); marker(v, x, z, 'move');
  }
  function placeOrFire(v, x, z, keep = false) {
    if (v.placing) { issue(v, { type: 'build', kind: v.placing, x, z }); m.sound?.ui('build'); if (!keep) setPlacing(v, null); return true; }
    if (v.aim) { fireAim(v, x, z); return true; }
    return false;
  }
  function marker(v, x, z, kind) {
    const p = proj(v, x, groundY(m.map, x, z), z);
    const el = document.createElement('div'); el.className = 'hv-marker ' + kind; el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    v.overlay.append(el); setTimeout(() => el.remove(), 600);
  }
  const proj = (v, x, y, z) => { const p = v.camera.project(x, y, z, v.vp.rect); p.x -= v.vp.rect.x; p.y -= v.vp.rect.y; return p; };
  function cameraBox(v) {
    const r = v.vp.rect;
    const pts = [[0, 0], [r.w, 0], [r.w, r.h - 150], [0, r.h - 150]].map(([x, y]) => v.camera.groundAt(x, y, r));
    return pts.every(Boolean) ? pts : null;
  }
  function openMenu(v, focus) {
    v.menuOpen = true; v.nav.enabled = true;
    v.root.classList.add('menu-open');
    const el = focus ? v.hud.el.querySelector(focus) : null;
    v.nav.reset(); if (el) v.nav.focus(el);
    if (v.moving) { issue(v, { type: 'stop' }); v.moving = false; }
  }
  function closeMenu(v) {
    if (!v.isPad || !v.menuOpen) return;
    v.menuOpen = false; v.nav.enabled = false; v.root.classList.remove('menu-open');
    if (v.hud.shopOpen) v.hud.toggleShop(false);
  }

  // ── keyboard + mouse ───────────────────────────────────────────────────────────────────────────
  const kbm = { keys: new Set(), mouse: { x: 0, y: 0, inside: false } };
  const kbmView = () => m?.views.find((v) => v.device === 'kbm') || null;
  function bindKbm() {
    const isUi = (t) => t.closest && t.closest('[data-ui], button, select, input, canvas.hv-mini, .hv-result');
    m.onDown = (e) => {
      const v = kbmView(); if (!v || isUi(e.target) || m.over) return;
      const g = groundAtClient(v, e.clientX, e.clientY); if (!g) return;
      if (e.button === 0) placeOrFire(v, g.x, g.z, e.shiftKey);
      else if (e.button === 2) { if (v.placing || v.aim) cancel(v); else smartAct(v, g.x, g.z); }
    };
    m.onMove = (e) => { kbm.mouse.x = e.clientX; kbm.mouse.y = e.clientY; kbm.mouse.inside = true; };
    m.onLeave = () => { kbm.mouse.inside = false; };
    m.onWheel = (e) => { const v = kbmView(); if (!v || isUi(e.target)) return; e.preventDefault(); v.camera.zoomBy(e.deltaY > 0 ? 1 : -1); };
    m.onCtx = (e) => { if (!e.target.closest('.hv-mini')) e.preventDefault(); };
    m.onKey = (e) => {
      if (e.target.closest && e.target.closest('input, select, textarea')) return;
      const down = e.type === 'keydown';
      if (down) kbm.keys.add(e.code); else kbm.keys.delete(e.code);
      const v = kbmView();
      if (!down || e.repeat || !m || m.over || !v) return;
      if (e.code === 'Escape') { if (v.placing || v.aim) cancel(v); else if (v.hud.shopOpen) v.hud.toggleShop(false); else togglePause(v); return; }
      if (e.code === 'Space') { e.preventDefault(); v.camera.centre(); return; }
      if (e.code === 'KeyM') { if (m.sound) { m.sound.setMuted(!m.sound.settings.muted); for (const w of m.views) w.hud.setSound?.(m.sound); } return; }
      if (['KeyQ', 'KeyW', 'KeyE', 'KeyR'].includes(e.code)) { e.preventDefault(); setAim(v, { skill: e.code.slice(3) }); return; }
      const i = BUILD_KEYS.indexOf(e.code);
      if (v.role === 'farmer') {
        if (i >= 0 && data.hvf.buildings.order[i]) { setPlacing(v, data.hvf.buildings.order[i]); return; }
        if (e.code === 'KeyG') setAim(v, { army: true });
      } else {
        if (i >= 0 && i < 6) { v.hud.useSlot(i); return; }
        if (e.code === 'KeyL') setAim(v, { lodge: true });
        if (e.code === 'KeyB') v.hud.toggleShop();
      }
    };
    host.addEventListener('mousedown', m.onDown);
    window.addEventListener('mousemove', m.onMove);
    host.addEventListener('mouseleave', m.onLeave);
    host.addEventListener('wheel', m.onWheel, { passive: false });
    host.addEventListener('contextmenu', m.onCtx);
    window.addEventListener('keydown', m.onKey);
    window.addEventListener('keyup', m.onKey);
  }
  function unbindKbm() {
    if (!m?.onDown) return;
    host.removeEventListener('mousedown', m.onDown);
    window.removeEventListener('mousemove', m.onMove);
    host.removeEventListener('mouseleave', m.onLeave);
    host.removeEventListener('wheel', m.onWheel);
    host.removeEventListener('contextmenu', m.onCtx);
    window.removeEventListener('keydown', m.onKey);
    window.removeEventListener('keyup', m.onKey);
    kbm.keys.clear();
  }
  function groundAtClient(v, cx, cy) {
    const c = gfx.renderer.domElement.getBoundingClientRect();
    return v.camera.groundAt(cx - c.left - v.vp.rect.x, cy - c.top - v.vp.rect.y, v.vp.rect);
  }
  function togglePause(v) {
    if (m.net) { v.hud.alert('Online matches do not pause', 'info', 1400); return; }
    m.paused = !m.paused;
    m.clock.setPaused(m.paused);
    for (const w of m.views) w.hud.alert(m.paused ? 'Paused — Esc / Menu to resume' : 'Resumed', 'info', 1200);
  }

  // ── gamepad (B's device frames) ────────────────────────────────────────────────────────────────
  function padFrame(v, f, dt) {
    const p = f.pressed;
    if (p.size) m.sound?.unlock();
    if (p.has('pause')) { togglePause(v); return; }
    if (m.paused) return;
    // right stick moves the aim ring around your character (screen right = +x, screen down = +z)
    const R = f.stickR || { x: 0, y: 0 };
    if (Math.abs(R.x) + Math.abs(R.y) > 0.05) {
      v.cursor.dx += R.x * 22 * dt; v.cursor.dz += R.y * 22 * dt;
      const l = Math.hypot(v.cursor.dx, v.cursor.dz), max = 18;
      if (l > max) { v.cursor.dx *= max / l; v.cursor.dz *= max / l; }
    }
    if (v.menuOpen) {
      // the button that opened the menu is a d-pad direction too: ignore it until it is let go
      if (v.menuGuard && f.held.has(v.menuGuard)) return;
      v.menuGuard = null;
      v.nav.handle(f); return;
    }
    // left stick walks: a short move order ahead, refreshed while held
    const L = f.stickL || { x: 0, y: 0 }, mag = Math.hypot(L.x, L.y);
    const e = charOf(v);
    if (mag > 0.3 && e?.alive) {
      if (performance.now() >= v.moveAt) {
        v.moveAt = performance.now() + 180;
        const d = 3 + 2 * mag;
        issue(v, { type: 'move', x: e.x + L.x / mag * d, z: e.z + L.y / mag * d });
        if (Math.hypot(v.cursor.dx, v.cursor.dz) < 2) { v.cursor.dx = L.x / mag * 6; v.cursor.dz = L.y / mag * 6; }
      }
      v.moving = true;
    } else if (v.moving) { v.moving = false; issue(v, { type: 'stop' }); }
    const cur = e ? { x: e.x + v.cursor.dx, z: e.z + v.cursor.dz } : null;
    v.ground = cur;
    if ((v.placing || v.aim) && p.has('back')) { cancel(v); return; }
    if (p.has('attack') && cur) { if (!placeOrFire(v, cur.x, cur.z)) smartAct(v, cur.x, cur.z); }
    for (const [act, k] of [['skillQ', 'Q'], ['skillW', 'W'], ['skillE', 'E'], ['skillR', 'R']]) if (p.has(act) && !(act === 'skillE' && (v.placing || v.aim))) {
      if (v.role === 'hunter' && k !== 'R') { setAim(v, { skill: k }); if (k !== 'R' && cur) { /* aim then confirm with A */ } }
      else setAim(v, { skill: k });
    }
    if (p.has('barracks')) { openMenu(v, v.role === 'farmer' ? '.hv-build button' : '.hv-skills button'); v.menuGuard = 'barracks'; }
    if (p.has('drillyard')) setAim(v, v.role === 'farmer' ? { army: true } : { lodge: true });
    if (v.role === 'hunter') {
      if (p.has('outfitter')) { v.hud.toggleShop(true); openMenu(v, '.hv-shop .hv-item'); v.menuGuard = 'outfitter'; }
      const usable = (m.sim.state.players[v.player].inv || []).map((it, i) => (it && data.hvf['hunter-items'].items[it.id].use ? i : -1)).filter((i) => i >= 0);
      if (p.has('useFirst') && usable[0] != null) v.hud.useSlot(usable[0]);
      if (p.has('useSecond') && usable[1] != null) v.hud.useSlot(usable[1]);
    }
    if (p.has('centre')) { v.camera.centre(); v.cursor.dx = 0; v.cursor.dz = 6; }
  }

  // ── per frame ──────────────────────────────────────────────────────────────────────────────────
  function frame(dt, frames = null) {
    if (setup && !m) { setupFrame(frames || devices?.poll()); return; }
    if (!m) return;
    if (!frames && devices) frames = devices.poll();
    const sim = m.sim, s = sim.state;
    for (const v of m.views) {
      // camera pan: arrows + screen edges (keyboard view), right-stick ring keeps the pad camera on the character
      let px = 0, py = 0;
      if (v.device === 'kbm') {
        if (kbm.keys.has('ArrowLeft')) px -= 1; if (kbm.keys.has('ArrowRight')) px += 1;
        if (kbm.keys.has('ArrowUp')) py += 1; if (kbm.keys.has('ArrowDown')) py -= 1;
        const r = v.vp.rect, e2 = 6, mx = kbm.mouse.x - r.x;
        if (kbm.mouse.inside && document.hasFocus?.() && mx >= 0 && mx <= r.w) {
          if (mx < e2) px -= 1; else if (mx > r.w - e2) px += 1;
          if (kbm.mouse.y < e2) py += 1; else if (kbm.mouse.y > r.h - e2) py -= 1;
        }
        v.ground = kbm.mouse.inside ? groundAtClient(v, kbm.mouse.x, kbm.mouse.y) : null;
      } else {
        const f = frames?.get(v.device);
        if (f && !m.over) padFrame(v, f, dt);
      }
      const e = charOf(v);
      v.camera.update(dt, { follow: e && e.alive ? { x: e.x, z: e.z } : null, pan: { x: px, y: py }, viewportH: v.vp.rect.h });
    }

    // sim
    const events = m.clock.frame(dt * 1000, () => { const q = m.queue; m.queue = []; return q; });
    for (const ev of events) {
      m.actors.onEvent(ev);
      for (const v of m.views) v.hud.onEvent(ev);
      m.sound?.onEvent(ev);
    }
    if (m.net) for (const v of m.views) { const w = m.clock.waitingFor || []; v.hud.setWaiting?.(w.length ? `Waiting for ${w.map((x) => x.name + (x.hidden ? ' (tab hidden)' : '')).join(', ')}` : ''); }

    if (s.tick !== m.lastFogTick) {
      m.lastFogTick = s.tick;
      for (const team of new Set(m.views.map((v) => v.team))) m.world.setFog(s.hvf.vision[team], s.hvf.explored[team], team);
    }
    m.world.syncChopped(s.hvf.chopped);
    // trees being cut shake and lean as the chop goes on
    // (the start tick lives in a view-side map: the view never writes to the sim's state, which is hashed)
    if (m.world.nature) {
      const chopping = m.chopping || (m.chopping = new Map());
      for (const e of s.ents) {
        const o = e.ord;
        if (!o || o.k !== 'chop' || !(o.until > 0)) { chopping.delete(e.id); continue; }
        let c = chopping.get(e.id);
        if (!c || c.cell !== o.cell) { c = { cell: o.cell, from: s.tick }; chopping.set(e.id, c); }
        m.world.chop(o.cell, Math.min(0.95, (s.tick - c.from) / Math.max(1, o.until - c.from)));
      }
    }
    m.frameDt = m.paused ? 0 : dt;

    for (const v of m.views) {
      const visible = (e) => Q.visibleEnt(sim, v.team, e);
      // placement ghost (positioned here, shown only in its own viewport by drawFor)
      if (v.ghost && v.ground) {
        const def = data.hvf.buildings.kinds[v.placing], cell = m.map.cell;
        const cx = Math.round(v.ground.x / cell - def.size[0] / 2), cz = Math.round(v.ground.z / cell - def.size[1] / 2);
        const x = (cx + def.size[0] / 2) * cell, z = (cz + def.size[1] / 2) * cell;
        v.ghost.position.set(x, groundY(m.map, x, z), z);
        const why = Q.buildCheck(sim, v.player, v.placing, v.ground.x, v.ground.z);
        v.ghost.material.opacity = why ? 0.3 : 0.65;
        const how = v.isPad ? '<kbd class="pad">A</kbd> place · <kbd class="pad">B</kbd> cancel' : 'left-click · Shift keeps placing · right-click cancels';
        v.hud.setPlaceHint(`Place the <b>${def.name}</b>${why ? ` — <span class="bad">${REASONS[why] || why}</span>` : ''} · ${how}`);
      }
      if (v.cursorEl) {
        const show = !!v.ground && !v.menuOpen;
        v.cursorEl.hidden = !show;
        if (show) { const pp = proj(v, v.ground.x, groundY(m.map, v.ground.x, v.ground.z), v.ground.z); v.cursorEl.style.transform = `translate(${pp.x.toFixed(0)}px, ${pp.y.toFixed(0)}px)`; v.cursorEl.classList.toggle('aiming', !!(v.placing || v.aim)); }
      }
      const r = v.vp.rect, key = `${r.x},${r.y},${r.w},${r.h}`;
      if (v.root._r !== key) { v.root._r = key; Object.assign(v.root.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); }
      drawBars(v, visible);
      v.hud.update(dt, { visibleEnt: visible, remembered: v.team === 1 ? Q.seenBuildings(sim, 1) : [], placing: v.placing });
    }

    if (sim.over && !m.over) {
      m.overT -= dt;
      if (m.overT <= 0) {
        m.over = true;
        m.sound?.result(m.views.some((v) => v.team === s.result.winner));
        for (const v of m.views) {
          cancel(v); closeMenu(v);
          v.hud.showResult(s.result, { onAgain: () => (m.net ? (end(), openSetup()) : start({ ...m.opts, seed: null })), onBack: () => { end(); openSetup(); } });
          if (v.isPad) { v.resNav = createMenuNav(v.hud.el.querySelector('.hv-result'), { selector: 'button' }); }
        }
      }
    }
    if (m?.over) for (const v of m.views) if (v.resNav) v.resNav.handle(frames?.get(v.device));
  }

  /** Before each viewport renders: its team's fog, what its team may see, its own placement ghost. */
  function drawFor(v) {
    if (!m) return;
    const sim = m.sim;
    m.world.useTeam(v.team);
    m.world.update(v.camera.camera, m.frameDt);
    m.actors.setTeam(v.team);
    m.actors.sync(sim.state, m.clock.alpha, m.frameDt, (e) => Q.visibleEnt(sim, v.team, e), v.team === 1 ? Q.seenBuildings(sim, 1) : []);
    m.frameDt = 0;   // animate once per frame, not once per viewport
    for (const w of m.views) if (w.ghost) w.ghost.visible = w === v && !!w.ground;
  }

  function drawBars(v, visible) {
    const s = m.sim.state, seen = new Set();
    for (const e of s.ents) {
      if (!e.alive || e._gone) continue;
      const isChar = e.kind === 'farmer' || e.kind === 'hunter';
      if (!isChar && !(e.kind === 'army' || e.kind === 'building')) continue;
      if (!isChar && e.hp >= e.hpMax - 0.5) continue;
      if (!visible(e)) continue;
      const h = e.kind === 'building' ? 4 : e.kind === 'hunter' ? 2.6 : 2.2;
      const p = proj(v, e.x, groundY(m.map, e.x, e.z) + h, e.z);
      if (!p.visible) continue;
      seen.add(e.id);
      let b = v.bars.get(e.id);
      if (!b) { b = document.createElement('div'); b.className = 'hv-hp ' + (e.team === v.team ? 'mine' : 'foe') + (e.id === s.players[v.player].ent ? ' me' : ''); b.innerHTML = '<i></i>'; v.overlay.append(b); v.bars.set(e.id, b); }
      b.style.transform = `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px)`;
      b.firstChild.style.width = Math.max(0, Math.min(100, e.hp / e.hpMax * 100)).toFixed(0) + '%';
    }
    for (const [id, b] of v.bars) if (!seen.has(id)) { b.remove(); v.bars.delete(id); }
  }

  function end() {
    if (!m) return;
    unbindKbm();
    if (m.unlock) { host.removeEventListener('pointerdown', m.unlock); window.removeEventListener('keydown', m.unlock); }
    m.sound?.dispose();
    m.net?.match.lockstep.close?.();
    m.net?.detach?.();
    try { m.net?.room.leave(); } catch { /* closed */ }
    m.world.dispose(); m.actors.dispose();
    for (const v of m.views) { gfx.removeViewport(v.vp); v.hud.destroy(); v.nav?.destroy(); v.root.remove(); devices?.release?.('hvf' + v.i); }
    for (const v of m.vpsWas) gfx.addViewport(v);
    for (const c of m.hidden) c.visible = true;
    gfx.scene.background = m.sceneWas.background; gfx.scene.fog = m.sceneWas.fog;
    m = null;
    if (window.hvf === api) delete window.hvf;
  }

  // ── online (stream D's room + transport + lockstep: js/net/lobbysync.js with HvF's room mode, online.js) ──
  const online = {
    room: null, hashes: {},
    async transport() { const { createTransport } = await import('../../net/transport.js'); return createTransport(transportKind || params.get('net') || 'peerjs'); },
    attach(room) {
      online.room = room;
      if (setup) { setup.online = setup.online || {}; setup.online.room = room; }
      room.on('change', () => { if (setup) drawSetup(); });
      room.on('start', (packet) => online.begin(packet));
      room.on('error', (e) => { if (setup?.online) { setup.online.error = e.message; drawSetup(); } for (const v of m?.views || []) v.hud.alert(e.message, 'bad', 4000); });
      room.on('closed', () => { if (m?.net) for (const v of m.views) v.hud.alert('Host left — match ended', 'bad', 4000); });
    },
    async host(code, { format = choice.format, name = 'Host' } = {}) {
      const { createRoom } = await import('../../net/lobbysync.js');
      const room = await createRoom({ transport: await online.transport(), code, name, dataHash: data.hash, mode: 'hvf', format, roomMode: hvfRoomMode(rules) });
      online.attach(room); return room.code;
    },
    async join(code, { name = 'Guest' } = {}) {
      const { cleanRoomCode } = await import('../../net/transport.js');
      const { joinRoom } = await import('../../net/lobbysync.js');
      const room = await joinRoom({ transport: await online.transport(), code: cleanRoomCode(code), name, dataHash: data.hash });
      online.attach(room); return true;
    },
    claim(key, o = {}) { const dev = choice.seats[0].device || 'kbm'; return online.room.claim(key, { local: 0, device: dev, name: o.name || (online.room.isHost ? 'Host' : 'Guest'), ...o }); },
    ready(key, r = true) { return online.room.ready(key, r); },
    start(o = {}) { return online.room.start({ seed: o.seed ?? choice.seed ?? undefined, tickMs: o.tickMs, startIn: o.startIn }); },
    async begin(packet) {
      const { beginMatch } = await import('../../net/lobbysync.js');
      const { createNetClock } = await import('../../net/netclock.js');
      closeSetup(); end();
      online.hashes = {};
      const match = beginMatch(online.room, packet, {
        data, createSim, restoreSim, now: () => performance.now(),
        onEvent: (type, e = {}) => { for (const v of m?.views || []) { if (type === 'takeover') v.hud.alert(`${e.name || 'A player'} left — an AI takes their seat`, 'warn', 3600); else if (type === 'hostLeft') v.hud.alert('Host left — match ended', 'bad', 4000); } },
        onTick: (t, sim) => { if (t % 200 === 0) online.hashes[t] = sim.hash(); },
      });
      const clock = createNetClock({ lockstep: match.lockstep, tickMs: packet.tickMs });
      const detach = clock.attachVisibility?.(document);
      let local = match.localPlayers.map((lp, i) => ({ player: lp.pid, device: lp.device || 'kbm', slot: i }));
      // A machine with no seat (a host who left every seat to guests and AI) still has to run: the host
      // assembles every turn, so if it never pumps its clock everyone waits forever. It WATCHES from
      // the first farmer's side; anything it issues is dropped by the lockstep (it owns no players).
      const watching = !local.length;
      if (watching) local = [{ player: 0, device: 'kbm', slot: 0 }];
      begin({ sim: match.sim, clock, local, opts: { format: packet.config.format, online: true, watching }, net: { match, clock, room: online.room, detach } });
      if (watching) for (const v of m.views) v.hud.alert('You have no seat in this match: watching from the farmers\' side.', 'info', 6000);
    },
  };

  // test hooks
  const api = {
    openSetup, start, frame, end, online,
    /** Resolves once stream C's models are in (a match started before then uses the stand-ins). */
    ready,
    get active() { return !!m || !!setup; },
    get match() { return m; },
    /** Is this spot in sight for any seat at this screen (tests; the sound bridge uses the same rule). */
    visibleAt(x, z) { return !!m && m.views.some((v) => Q.visibleAt(m.sim, v.team, x, z)); },
    get choice() { return choice; },
    state: () => m?.sim.state,
    issue: (c, seat = 0) => m && issue(m.views[seat], c),
    /** Run the sim forward right now (local matches; queued commands go in on the first tick). */
    fastForward(ticks) { if (!m || m.net) return 0; let n = 0; const sim = m.sim; while (n < ticks && !sim.over) { const q = m.queue; m.queue = []; sim.step(q); for (const ev of sim.drainEvents()) for (const v of m.views) v.hud.onEvent(ev); n++; } return n; },
    lookAt(x, z, seat = 0) { m?.views[seat]?.camera.lookAt(x, z); },
    setFogOn(v) { m?.world.setFogOn(v); },
    probe() {
      gfx.render();
      const gl = gfx.renderer.getContext(), pr = gfx.renderer.getPixelRatio(), H = gl.drawingBufferHeight, px = new Uint8Array(4);
      return gfx.viewports.map((vp) => {
        const r = vp.rect, vals = [];
        for (let yi = 1; yi <= 10; yi++) for (let xi = 1; xi <= 10; xi++) { gl.readPixels(Math.floor((r.x + r.w * xi / 11) * pr), H - 1 - Math.floor((r.y + r.h * yi / 11) * pr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); vals.push(0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]); }
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        return { id: vp.id, rect: { ...r }, mean, sd: Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length), calls: gfx.info().calls };
      });
    },
  };
  return api;
}
