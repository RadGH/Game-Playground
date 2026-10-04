// The lobby (PLAN §9.3, §11.6, §12): mode, slots, race + hero per slot, ready -> countdown -> match.
//
// Every local player drives their OWN card with their own device:
//   join   — "Press Enter/Space (keyboard) or A/Start (controller)": the press assigns that device to
//            the first open slot (or the first AI slot, so two people on one screen can play 1v1),
//   up/down — move between fields (Player 1, the host, also reaches Mode, Speed and every AI slot),
//   left/right — change the field (hero, race, team, mode, speed, slot kind / AI difficulty),
//   join again — ready; back (Esc / B) — unready, then leave.
// The mouse can click everything too. When every local player is ready, a 3-2-1 countdown starts.
//
// The session (mode, slots, devices, speed) lives in `session` and survives the match, so
// "Back to lobby" returns with the same slots and devices (ready flags cleared).

import { h } from './dom.js';
import { icon } from './icons.js';
import { TEAM_CSS } from '../view/terrain.js';
import { gamepadsAvailable } from '../input/gamepad.js';

const MODES = ['1v1', '2v2', '3v3'];
const SPEEDS = [{ v: 1, label: 'Normal' }, { v: 2, label: 'Fast ×2' }, { v: 8, label: 'Debug ×8' }];
const AI_LEVELS = ['recruit', 'veteran', 'commander'];
const AI_NAMES = { recruit: 'Recruit', veteran: 'Veteran', commander: 'Commander' };
// Slot kinds a non-local slot cycles through (left/right, or the arrows on the card).
const KIND_CYCLE = ['ai:recruit', 'ai:veteran', 'ai:commander', 'closed', 'open'];
const TEAM_NAMES = ['Blue banner', 'Red banner'];
const DMG = { blade: 'Blade', pierce: 'Pierce', fire: 'Fire', nature: 'Nature' };
const ARM = { light: 'Light', heavy: 'Heavy', spectral: 'Spectral', hide: 'Hide', fortified: 'Fortified' };
const COUNTDOWN = 3;

export function defaultSession(data) {
  const s = { game: 'linewar', gameName: 'Line War', mode: '1v1', speed: 1, map: 'vale', slots: [], last: null };
  resizeSlots(s, data);
  return s;
}

function newSlot(team, index, data, kind) {
  const heroes = Object.keys(data.heroes.heroes), races = Object.keys(data.races.races);
  return { key: `t${team}s${index}`, team, index, kind, ai: 'recruit', device: null, lost: false, ready: false,
    hero: heroes[(team + index) % heroes.length], race: races[0], player: 0 };
}

function resizeSlots(s, data) {
  const n = Number(s.mode[0]);
  const keep = s.slots;
  const out = [];
  for (let team = 0; team < 2; team++) {
    for (let i = 0; i < n; i++) {
      const old = keep.find((x) => x.team === team && x.index === i);
      out.push(old || newSlot(team, i, data, team === 0 && i === 0 ? 'open' : 'ai'));
    }
  }
  // Local players whose slot fell off the end move into an open/AI slot of their team.
  for (const lost of keep.filter((x) => x.kind === 'local' && !out.includes(x))) {
    const dst = out.find((x) => x.team === lost.team && x.kind !== 'local') || out.find((x) => x.kind !== 'local');
    if (dst) Object.assign(dst, { kind: 'local', device: lost.device, lost: lost.lost, hero: lost.hero, race: lost.race, player: lost.player, ready: false });
  }
  s.slots = out;
}

/** Sim config players[] from the session (team 0 first). Returns { players, local:[{slot, player}] }. */
export function sessionToPlayers(session, data) {
  const players = [], local = [];
  const ordered = session.slots.filter((x) => x.kind === 'local' || x.kind === 'ai').sort((a, b) => a.team - b.team || a.index - b.index);
  for (const sl of ordered) {
    const deck = data.races.races[sl.race].units.slice(0, 4);
    if (sl.kind === 'local') {
      local.push({ slot: sl, player: players.length });
      players.push({ team: sl.team, name: `Player ${sl.player}`, kind: 'human', race: sl.race, hero: sl.hero, deck });
    } else {
      players.push({ team: sl.team, name: `${AI_NAMES[sl.ai]} AI`, kind: 'ai', ai: { difficulty: sl.ai }, race: sl.race, hero: sl.hero, deck });
    }
  }
  return { players, local };
}

export function createLobby({ screen, data, devices, session, onStart, onBack }) {
  // The chosen game mode decides which heroes and races may be picked (modes.js modeList).
  let heroes = Object.keys(data.heroes.heroes);
  let races = Object.keys(data.races.races);
  function applyMode() {
    heroes = (session.heroes && session.heroes.length ? session.heroes : Object.keys(data.heroes.heroes)).filter((h) => data.heroes.heroes[h]);
    races = (session.races && session.races.length ? session.races : Object.keys(data.races.races)).filter((r) => data.races.races[r]);
    for (const s of session.slots) {
      if (!heroes.includes(s.hero)) s.hero = heroes[0];
      if (!races.includes(s.race)) s.race = races[0];
    }
  }
  const aiLevels = AI_LEVELS.filter((a) => data.ai?.difficulties?.[a]);
  const cursors = new Map();          // slot key -> field index into fieldsFor(slot)
  let countdown = -1, countFrom = 0;
  let active = false;
  let justJoined = new Set();
  let flash = '';

  screen.replaceChildren();
  const root = h('div', 'lobby');
  screen.append(root);

  // ---------- helpers ----------
  const locals = () => session.slots.filter((s) => s.kind === 'local');
  const slotOfDevice = (id) => session.slots.find((s) => s.kind === 'local' && s.device === id);
  const isHost = (slot) => slot.kind === 'local' && Math.min(...locals().map((s) => s.player)) === slot.player;
  function fieldsFor(slot) {
    const f = [];
    if (isHost(slot)) {
      f.push('mode', 'speed');
      for (const s of session.slots) if (s.kind !== 'local') f.push('slot:' + s.key);
    }
    f.push('hero', 'race', 'team', 'ready');
    return f;
  }
  // A cursor is stored as a FIELD NAME, so seats appearing or vanishing never move it.
  function cursorField(slot) {
    const f = fieldsFor(slot);
    let name = cursors.get(slot.key);
    if (!name || !f.includes(name)) { name = 'hero'; cursors.set(slot.key, name); }
    return name;
  }
  function nextPlayerNumber() { const used = new Set(locals().map((s) => s.player)); let n = 1; while (used.has(n)) n++; return n; }
  const cycle = (arr, v, d) => arr[(arr.indexOf(v) + d + arr.length) % arr.length];
  function kindKey(s) { return s.kind === 'ai' ? 'ai:' + s.ai : s.kind; }
  function setKind(s, k) {
    if (k.startsWith('ai:')) { s.kind = 'ai'; s.ai = k.slice(3); } else s.kind = k;
    s.ready = false;
  }

  // ---------- joining ----------
  function join(dev) {
    if (!active || slotOfDevice(dev.id)) return;
    if (locals().filter((s) => !s.lost).length >= 2 && !session.slots.some((s) => s.kind === 'local' && s.lost)) {
      flash = 'Two players per screen. Online seats arrive later.'; render(); return;
    }
    // A pad that dropped out re-claims its slot first ("Player 2, press A").
    let slot = session.slots.find((s) => s.kind === 'local' && s.lost && s.deviceType === dev.type);
    if (!slot) slot = session.slots.find((s) => s.kind === 'open');
    if (!slot) {
      // No open slot: take an AI slot, preferring the team with fewer local players (couch 1v1).
      const ls = locals();
      const lessTeam = ls.filter((s) => s.team === 0).length <= ls.filter((s) => s.team === 1).length ? 0 : 1;
      slot = session.slots.find((s) => s.kind === 'ai' && s.team === lessTeam) || session.slots.find((s) => s.kind === 'ai');
    }
    if (!slot) { flash = 'Every slot is taken — close a slot or change the mode.'; render(); return; }
    if (!slot.lost) slot.player = nextPlayerNumber();
    Object.assign(slot, { kind: 'local', device: dev.id, deviceType: dev.type, deviceLabel: dev.label, lost: false, ready: false });
    devices.claim(dev.id, slot.key);
    justJoined.add(dev.id);
    cursors.delete(slot.key);
    flash = '';
    render();
  }
  function leave(slot) {
    devices.release(slot.key);
    Object.assign(slot, { kind: 'open', device: null, lost: false, ready: false });
    // Keep Player 1 as the lowest number among those left.
    render();
  }
  const offJoin = devices.onJoin((dev) => join(dev));

  // ---------- field changes ----------
  function change(slot, field, d) {
    if (field === 'mode') { session.mode = cycle(MODES, session.mode, d); resizeSlots(session, data); for (const s of session.slots) s.ready = false; }
    else if (field === 'speed') { const vs = SPEEDS.map((x) => x.v); session.speed = cycle(vs, session.speed, d); }
    else if (field.startsWith('slot:')) {
      const s = session.slots.find((x) => x.key === field.slice(5));
      if (s && s.kind !== 'local') setKind(s, cycle(KIND_CYCLE.filter((k) => !k.startsWith('ai:') || aiLevels.includes(k.slice(3))), kindKey(s), d));
    } else if (field === 'hero') { slot.hero = cycle(heroes, slot.hero, d); slot.ready = false; }
    else if (field === 'race') { slot.race = cycle(races, slot.race, d); slot.ready = false; }
    else if (field === 'team') moveTeam(slot);
    else if (field === 'ready') slot.ready = !slot.ready;
    render();
  }
  function moveTeam(slot) {
    const other = 1 - slot.team;
    const dst = session.slots.find((s) => s.team === other && s.kind === 'open')
      || session.slots.find((s) => s.team === other && s.kind === 'ai')
      || session.slots.find((s) => s.team === other && s.kind === 'closed');
    if (!dst) { flash = 'The other side is full of players.'; return; }
    const keep = { kind: dst.kind, ai: dst.ai, hero: dst.hero, race: dst.race };
    Object.assign(dst, { kind: 'local', device: slot.device, deviceType: slot.deviceType, deviceLabel: slot.deviceLabel, lost: slot.lost, hero: slot.hero, race: slot.race, player: slot.player, ready: false });
    Object.assign(slot, keep, { device: null, lost: false, ready: false });
    devices.claim(dst.device, dst.key);
    cursors.set(dst.key, cursors.get(slot.key)); cursors.delete(slot.key);
  }

  // ---------- per-frame input ----------
  function frame(frames, dt) {
    if (!active) return;
    // Pads that vanished leave their slot waiting for "Player N, press A".
    for (const s of locals()) {
      const dev = devices.get(s.device);
      const lost = !dev || dev.connected === false || dev.duplicate;
      if (lost !== s.lost) { s.lost = lost; if (lost) { s.ready = false; devices.release(s.key); } render(); }
    }
    let changed = false;
    for (const [id, f] of frames) {
      const slot = slotOfDevice(id);
      if (!slot) {
        // An unjoined device pressing back with nobody joined returns to the title.
        if (f.pressed.has('back') && !locals().length && !justJoined.size) { onBack(); return; }
        continue;
      }
      if (justJoined.has(id)) continue;
      const fields = fieldsFor(slot);
      let i = fields.indexOf(cursorField(slot));
      if (f.pressed.has('navUp')) { i = Math.max(0, i - 1); cursors.set(slot.key, fields[i]); changed = true; }
      if (f.pressed.has('navDown')) { i = Math.min(fields.length - 1, i + 1); cursors.set(slot.key, fields[i]); changed = true; }
      const field = fields[i];
      if (f.pressed.has('navLeft')) { change(slot, field, -1); }
      if (f.pressed.has('navRight')) { change(slot, field, 1); }
      if (f.pressed.has('join') || f.pressed.has('ready')) { slot.ready = !slot.ready; changed = true; }
      if (f.pressed.has('back') || f.pressed.has('leave')) {
        if (slot.ready) slot.ready = false; else leave(slot);
        changed = true;
      }
    }
    justJoined = new Set([...justJoined].filter((id) => frames.get(id)?.held.has('join')));
    // Countdown when every local player is ready.
    const ls = locals();
    const allReady = ls.length > 0 && ls.every((s) => s.ready && !s.lost) && teamsValid();
    // Wall-clock countdown: a slow frame rate must not stretch "3-2-1" (frame dt is capped at 0.1 s).
    if (allReady && countdown < 0) { countdown = COUNTDOWN; countFrom = performance.now(); changed = true; }
    if (!allReady && countdown >= 0) { countdown = -1; changed = true; }
    if (countdown >= 0) {
      const before = Math.ceil(countdown);
      countdown = COUNTDOWN - (performance.now() - countFrom) / 1000;
      if (Math.ceil(countdown) !== before) changed = true;
      if (countdown <= 0) { countdown = -1; active = false; onStart(session); return; }
    }
    if (changed) render();
  }
  function teamsValid() {
    return [0, 1].every((t) => session.slots.some((s) => s.team === t && (s.kind === 'local' || s.kind === 'ai')));
  }

  // ---------- mouse ----------
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const act = b.dataset.act, key = b.dataset.slot;
    const slot = key ? session.slots.find((s) => s.key === key) : null;
    const d = Number(b.dataset.d || 1);
    if (act === 'mode') { session.mode = b.dataset.v; resizeSlots(session, data); for (const s of session.slots) s.ready = false; render(); }
    else if (act === 'speed') { session.speed = Number(b.dataset.v); render(); }
    else if (act === 'kind' && slot) { change(slot, 'slot:' + key, d); }
    else if (act === 'hero' && slot) change(slot, 'hero', d);
    else if (act === 'race' && slot) change(slot, 'race', d);
    else if (act === 'team' && slot) { moveTeam(slot); render(); }
    else if (act === 'ready' && slot) change(slot, 'ready', 1);
    else if (act === 'leave' && slot) leave(slot);
    else if (act === 'join-kb' && slot) {
      // Mouse click on an open slot = the keyboard joins there.
      if (!slotOfDevice('kbm')) {
        const keep = session.slots.filter((s) => s !== slot && s.kind === 'open');
        keep.forEach((s) => { s.kind = 'hold'; });
        join(devices.kbm);
        keep.forEach((s) => { s.kind = 'open'; });
        justJoined.delete('kbm');
      }
    }
    else if (act === 'back') onBack();
  });

  // ---------- render ----------
  function focusClass(field, ownerKey) {
    const owners = [];
    for (const s of locals()) {
      if (s.lost) continue;
      const f = cursorField(s);
      if (f === field && (ownerKey == null || ownerKey === s.key || field.startsWith('slot:') || field === 'mode' || field === 'speed')) owners.push(s.player);
    }
    return owners.length ? ` pfocus pf${owners[0]}" data-pf="P${owners.join(' P')}` : '';
  }

  function arrowRow(label, value, act, slot, field, editable, sub = '') {
    const fc = editable ? focusClass(field, slot.key) : '';
    return `<div class="lb-row${fc}">
      <span class="lb-rl">${label}</span>
      <button class="lb-arrow" data-act="${act}" data-slot="${slot.key}" data-d="-1" ${editable ? '' : 'disabled'} aria-label="Previous">‹</button>
      <span class="lb-rv"><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</span>
      <button class="lb-arrow" data-act="${act}" data-slot="${slot.key}" data-d="1" ${editable ? '' : 'disabled'} aria-label="Next">›</button>
    </div>`;
  }

  function deviceIcon(s) {
    return s.deviceType === 'gamepad' ? icon('gamepad') : icon('keyboard');
  }

  function slotCard(s) {
    const color = TEAM_CSS[s.team];
    const hd = data.heroes.heroes[s.hero], rd = data.races.races[s.race];
    const trait = data.races.traits?.[rd?.trait];
    if (s.kind === 'open' || s.kind === 'hold') {
      return `<div class="lb-slot open" style="--team:${color}">
        <button class="lb-join" data-act="join-kb" data-slot="${s.key}">
          <span class="lb-join-icons">${icon('keyboard')}${icon('gamepad')}</span>
          <b>Open seat</b><span>Press <kbd>Enter</kbd> / <kbd>Space</kbd> or <kbd class="pad">A</kbd> to join</span>
        </button>
        ${hostKindRow(s)}
      </div>`;
    }
    if (s.kind === 'closed') {
      return `<div class="lb-slot closed" style="--team:${color}"><div class="lb-closed">Closed seat</div>${hostKindRow(s)}</div>`;
    }
    const isLocal = s.kind === 'local';
    const editable = isLocal;
    const mouseEdit = isLocal ? s.device === 'kbm' : true;
    const head = isLocal
      ? `<div class="lb-head"><span class="lb-dev ${s.lost ? 'lost' : ''}">${deviceIcon(s)}</span><b>Player ${s.player}</b><span class="lb-devname">${s.lost ? (s.deviceType === 'gamepad' ? `Controller lost — Player ${s.player}, press A` : 'Device lost') : s.deviceLabel || ''}</span>${isHost(s) ? '<span class="lb-host">Host</span>' : ''}</div>`
      : `<div class="lb-head ai"><span class="lb-dev">${icon('crown')}</span>${hostKindRow(s)}</div>`;
    const heroSub = hd ? `${DMG[hd.dmgType] || ''} · ${ARM[hd.armourClass] || ''}` : '';
    const deck = (rd?.units || []).slice(0, 4).map((u) => `<span class="lb-unit t${data.units.units[u]?.tier}">${data.units.units[u]?.name || u}</span>`).join('');
    return `<div class="lb-slot ${isLocal ? 'local' : 'ai'}${s.ready ? ' ready' : ''}" style="--team:${color}">
      ${head}
      ${arrowRow('Hero', hd?.name || s.hero, 'hero', s, 'hero', mouseEdit || editable, heroSub)}
      ${isLocal ? `<div class="lb-desc">${hd?.desc || ''}</div>` : ''}
      ${arrowRow('Army', rd?.name || s.race, 'race', s, 'race', mouseEdit || editable, trait ? trait.name : '')}
      ${isLocal ? `<div class="lb-desc">${trait?.desc || ''}</div><div class="lb-deck">${deck}</div>` : ''}
      ${isLocal ? `<div class="lb-actions">
        <button class="lb-btn${focusClass('team', s.key)}" data-act="team" data-slot="${s.key}">${icon('people')} Switch side</button>
        <button class="lb-btn ready-btn${focusClass('ready', s.key)}" data-act="ready" data-slot="${s.key}">${s.ready ? `${icon('flag')} Ready` : 'Not ready'}</button>
        <button class="lb-x" data-act="leave" data-slot="${s.key}" aria-label="Leave seat" data-tip="Leave this seat">×</button>
      </div>` : ''}
    </div>`;
  }
  function hostKindRow(s) {
    const k = kindKey(s);
    const label = k.startsWith('ai:') ? `AI · ${AI_NAMES[k.slice(3)]}` : k === 'closed' ? 'Closed' : 'Open';
    return `<div class="lb-kind${focusClass('slot:' + s.key)}">
      <button class="lb-arrow" data-act="kind" data-slot="${s.key}" data-d="-1" aria-label="Previous seat type">‹</button>
      <span>${label}</span>
      <button class="lb-arrow" data-act="kind" data-slot="${s.key}" data-d="1" aria-label="Next seat type">›</button>
    </div>`;
  }

  function render() {
    if (!active) return;
    const n = Number(session.mode[0]);
    const ls = locals();
    const padsOk = gamepadsAvailable();
    const httpsUrl = `https://${location.hostname}:8441${location.pathname}`;
    const last = session.last;
    const readyCount = ls.filter((s) => s.ready).length;
    const status = countdown >= 0 ? `<span class="lb-count">Marching in <b>${Math.ceil(countdown)}</b></span>`
      : !ls.length ? 'Press <kbd>Enter</kbd> / <kbd>Space</kbd> on the keyboard or <kbd class="pad">A</kbd> / <kbd class="pad">Start</kbd> on a controller to join'
      : !teamsValid() ? 'Each side needs at least one player or AI'
      : `${readyCount} of ${ls.length} ready — press your join key again when ready`;
    root.innerHTML = `
      <header class="lb-top">
        <button class="lb-back" data-act="back">‹ Modes</button>
        <div class="lb-title"><h1>${session.gameName || 'Line War'}</h1><span>War council · Vale · ${session.mode}</span></div>
        <div class="lb-modes${focusClass('mode')}">${MODES.map((m) => `<button class="lb-mode${session.mode === m ? ' on' : ''}" data-act="mode" data-v="${m}">${m}</button>`).join('')}</div>
        <div class="lb-speed${focusClass('speed')}"><span>Speed</span>${SPEEDS.map((sp) => `<button class="chip${session.speed === sp.v ? ' on' : ''}" data-act="speed" data-v="${sp.v}">${sp.label}</button>`).join('')}</div>
      </header>
      ${last ? `<div class="lb-last ${last.cls}">${last.text}</div>` : ''}
      <div class="lb-teams n${n}">
        ${[0, 1].map((t) => `<section class="lb-team t${t}" style="--team:${TEAM_CSS[t]}">
          <h2>${icon('flag')}${TEAM_NAMES[t]}</h2>
          <div class="lb-slots">${session.slots.filter((s) => s.team === t).map(slotCard).join('')}</div>
        </section>`).join('<div class="lb-vs">vs</div>')}
      </div>
      <footer class="lb-foot">
        <div class="lb-status">${status}</div>
        <div class="lb-help">${ls.length ? '<kbd>↑</kbd><kbd>↓</kbd> field · <kbd>←</kbd><kbd>→</kbd> change · <kbd>Esc</kbd>/<kbd class="pad">B</kbd> unready / leave' : ''}</div>
        ${padsOk ? '' : `<div class="lb-notice">${icon('gamepad')} Controllers only work on the secure page: <a href="${httpsUrl}">${httpsUrl}</a></div>`}
        ${flash ? `<div class="lb-flash">${flash}</div>` : ''}
      </footer>
      ${countdown >= 0 ? `<div class="lb-countdown"><b>${Math.ceil(countdown)}</b></div>` : ''}`;
  }

  return {
    show() { applyMode(); active = true; screen.hidden = false; countdown = -1; for (const s of session.slots) s.ready = false; justJoined = new Set(); render(); },
    hide() { active = false; screen.hidden = true; },
    get active() { return active; },
    frame,
    render,
    get session() { return session; },
    destroy() { offJoin(); root.remove(); },
  };
}
