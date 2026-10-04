// Online play screens (stream D's js/net/lobbysync.js, interfaces.md §12):
//   createJoinScreen  — type (or pick with the d-pad) a 5-letter room code, Join.
//   createNetLobby    — the room: big code + copy, machines with ping, seats per team. Local devices
//                       claim open seats with their join key exactly like the couch lobby (couch play
//                       works online); left/right change hero and army, join again = ready, back =
//                       unready then leave. The host also sets the format, AI / closed seats and
//                       presses Start when every human seat is ready.
// Both are mouse, keyboard and pad drivable.

import { h } from './dom.js';
import { icon } from './icons.js';
import { createMenuNav } from './menunav.js';
import { TEAM_CSS } from '../view/terrain.js';
import { gamepadsAvailable } from '../input/gamepad.js';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const FORMATS = ['1v1', '2v2', '3v3'];
const AI_CYCLE = ['open', 'ai:recruit', 'ai:veteran', 'ai:commander', 'closed'];
const AI_NAMES = { recruit: 'Recruit', veteran: 'Veteran', commander: 'Commander' };
const TEAM_NAMES = ['Blue banner', 'Red banner'];

// ---------------------------------------------------------------- join by code

export function createJoinScreen({ screen, onJoin, onBack }) {
  screen.replaceChildren();
  const root = h('div', 'netjoin');
  screen.append(root);
  const code = ['A', 'A', 'A', 'A', 'A'];
  let pos = 0, busy = false, error = '';
  function render() {
    root.innerHTML = `
      <header class="md-top"><button class="lb-back" data-act="back">‹ Title</button><div class="lb-title"><h1>Join by code</h1><span>Ask the host for the 5-letter room code</span></div></header>
      <div class="nj-card">
        <input class="nj-input" maxlength="5" spellcheck="false" autocomplete="off" placeholder="ROOM CODE" value="${code.join('')}" aria-label="Room code">
        <div class="nj-boxes">${code.map((c, i) => `<button class="nj-box${i === pos ? ' on' : ''}" data-i="${i}">${c}</button>`).join('')}</div>
        <p class="nj-help">Type the code, or with a controller: <kbd class="pad">←</kbd><kbd class="pad">→</kbd> choose a letter box, <kbd class="pad">↑</kbd><kbd class="pad">↓</kbd> change it, <kbd class="pad">A</kbd> join.</p>
        <button class="menu-btn primary nj-go" data-act="join" ${busy ? 'disabled' : ''}>${busy ? 'Joining…' : 'Join room'}</button>
        ${error ? `<p class="nj-err">${error}</p>` : ''}
      </div>`;
    const inp = root.querySelector('.nj-input');
    inp.addEventListener('input', () => {
      const v = inp.value.toUpperCase().replace(/[^A-Z]/g, '').replace(/[IO]/g, '').slice(0, 5);
      for (let i = 0; i < 5; i++) code[i] = v[i] || 'A';
      inp.value = v;
      pos = Math.min(4, v.length);
      root.querySelectorAll('.nj-box').forEach((b, i) => { b.textContent = code[i]; b.classList.toggle('on', i === pos); });
    });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
  }
  async function go() {
    if (busy) return;
    busy = true; error = ''; render();
    try { await onJoin(code.join('')); } catch (e) { busy = false; error = e.message || String(e); render(); }
  }
  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'back') onBack();
    if (act === 'join') go();
    const b = e.target.closest('.nj-box'); if (b) { pos = Number(b.dataset.i); render(); }
  });
  let shownAt = 0;
  return {
    show() { screen.hidden = false; busy = false; error = ''; render(); shownAt = performance.now(); setTimeout(() => root.querySelector('.nj-input')?.focus(), 50); },
    hide() { screen.hidden = true; },
    fail(msg) { busy = false; error = msg; render(); },
    /** Pad / keyboard-arrow input (typing goes straight into the text box). */
    frame(f) {
      if (screen.hidden || performance.now() - shownAt < 250 || busy) return;
      if (f.device === 'kbm' && document.activeElement?.classList.contains('nj-input')) {
        if (f.pressed.has('back')) onBack();
        return;
      }
      let ch = false;
      if (f.pressed.has('navLeft')) { pos = (pos + 4) % 5; ch = true; }
      if (f.pressed.has('navRight')) { pos = (pos + 1) % 5; ch = true; }
      if (f.pressed.has('navUp') || f.pressed.has('navDown')) {
        const i = LETTERS.indexOf(code[pos]);
        code[pos] = LETTERS[(i + (f.pressed.has('navUp') ? -1 : 1) + LETTERS.length) % LETTERS.length]; ch = true;
      }
      if (ch) render();
      if (f.pressed.has('confirm')) go();
      if (f.pressed.has('back')) onBack();
    },
  };
}

// ---------------------------------------------------------------- the room

export function createNetLobby({ screen, data, devices, onLeave, heroes: heroList = null, races: raceList = null }) {
  screen.replaceChildren();
  const root = h('div', 'lobby netroom');
  screen.append(root);
  const heroes = () => (heroList?.length ? heroList : Object.keys(data.heroes.heroes));
  const races = () => (raceList?.length ? raceList : Object.keys(data.races.races));
  let room = null, state = null, active = false, off = [], justJoined = new Set();
  const cursors = new Map();     // slot key -> 'hero' | 'race'
  let toast = '';

  const mine = () => (state?.slots || []).filter((s) => s.kind === 'human' && s.owner === room?.me);
  const slotOfDevice = (id) => mine().find((s) => s.device === id);
  const cycle = (arr, v, d) => arr[(arr.indexOf(v) + d + arr.length) % arr.length];

  function claim(dev) {
    if (!active || !room || slotOfDevice(dev.id)) return;
    const open = state.slots.find((s) => s.kind === 'open');
    if (!open) { toast = 'No open seat — ask the host to open one.'; render(); return; }
    if (mine().length >= 2) { toast = 'Two players per screen.'; render(); return; }
    const why = room.claim(open.key, { local: mine().length, name: `${state.machines.find((m) => m.id === room.me)?.name || 'Player'}${mine().length ? ' 2' : ''}`, race: races()[0], hero: heroes()[0], device: dev.id });
    if (why) toast = `Could not take that seat (${why}).`;
    justJoined.add(dev.id);
  }

  function frame(frames) {
    if (!active || !state) return;
    for (const [id, f] of frames) {
      const s = slotOfDevice(id);
      if (!s) { if (f.pressed.has('back') && !mine().length && !justJoined.size) { leave(); return; } continue; }
      if (justJoined.has(id)) continue;
      const field = cursors.get(s.key) || 'hero';
      if (f.pressed.has('navUp') || f.pressed.has('navDown')) cursors.set(s.key, field === 'hero' ? 'race' : 'hero');
      const d = f.pressed.has('navLeft') ? -1 : f.pressed.has('navRight') ? 1 : 0;
      if (d) room.update(s.key, field === 'hero' ? { hero: cycle(heroes(), s.hero, d) } : { race: cycle(races(), s.race, d) });
      if (f.pressed.has('join') || f.pressed.has('ready')) room.ready(s.key, !s.ready);
      if (f.pressed.has('back') || f.pressed.has('leave')) { if (s.ready) room.ready(s.key, false); else room.release(s.key); }
      if (f.pressed.has('navUp') || f.pressed.has('navDown')) render();
    }
    justJoined = new Set([...justJoined].filter((id) => frames.get(id)?.held.has('join')));
    // The host starts by itself two seconds after every seat is ready (pad-only hosts have no mouse).
    if (room?.isHost && state.phase === 'lobby') {
      if (canStart()) { if (!readyFor) readyFor = performance.now(); if (performance.now() - readyFor > 2000 && !started) { started = true; try { room.start(app().startOpts?.() || {}); } catch (e) { toast = e.message; render(); } } }
      else { readyFor = 0; started = false; }
    }
  }
  let readyFor = 0, started = false;

  function leave() { try { room?.leave(); } catch { /* closed */ } detach(); onLeave(); }
  function detach() { for (const f of off) f(); off = []; room = null; state = null; }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b || !room) return;
    const act = b.dataset.act, key = b.dataset.slot;
    const s = key ? state.slots.find((x) => x.key === key) : null;
    const d = Number(b.dataset.d || 1);
    if (act === 'leave') leave();
    if (act === 'kick' && room.isHost) room.kick(b.dataset.id);
    if (act === 'copy') { navigator.clipboard?.writeText(state.code).then(() => { toast = 'Room code copied'; render(); }, () => {}); }
    if (act === 'format' && room.isHost) room.configure({ format: b.dataset.v });
    if (act === 'kind' && room.isHost && s && s.kind !== 'human') {
      const k = cycle(AI_CYCLE, s.kind === 'ai' ? 'ai:' + s.difficulty : s.kind, d);
      room.setSlot(key, k.startsWith('ai:') ? { kind: 'ai', difficulty: k.slice(3) } : { kind: k });
    }
    if (act === 'hero' && s) room.update(key, { hero: cycle(heroes(), s.hero, d) });
    if (act === 'race' && s) room.update(key, { race: cycle(races(), s.race, d) });
    if (act === 'ready' && s) room.ready(key, !s.ready);
    if (act === 'release' && s) room.release(key);
    if (act === 'sit' && s && !slotOfDevice('kbm')) {
      const why = room.claim(key, { local: mine().length, name: state.machines.find((m) => m.id === room.me)?.name || 'Player', race: races()[0], hero: heroes()[0], device: 'kbm' });
      if (why) { toast = `Could not take that seat (${why}).`; render(); }
    }
    if (act === 'start' && room.isHost) { try { room.start(app().startOpts?.() || {}); } catch (err) { toast = err.message; render(); } }
  });
  const app = () => window.bannerline || {};

  function canStart() {
    const humans = state.slots.filter((s) => s.kind === 'human');
    return humans.length > 0 && humans.every((s) => s.ready) && [0, 1].every((t) => state.slots.some((s) => s.team === t && (s.kind === 'human' || s.kind === 'ai')));
  }

  function card(s) {
    const color = TEAM_CSS[s.team];
    const own = s.kind === 'human' && s.owner === room.me;
    const host = room.isHost;
    if (s.kind === 'open') return `<div class="lb-slot open" style="--team:${color}"><button class="lb-join" data-act="sit" data-slot="${s.key}"><span class="lb-join-icons">${icon('keyboard')}${icon('gamepad')}</span><b>Open seat</b><span>Press <kbd>Enter</kbd> / <kbd class="pad">A</kbd> to sit here</span></button>${host ? kindRow(s) : ''}</div>`;
    if (s.kind === 'closed') return `<div class="lb-slot closed" style="--team:${color}"><div class="lb-closed">Closed seat</div>${host ? kindRow(s) : ''}</div>`;
    if (s.kind === 'ai') return `<div class="lb-slot ai" style="--team:${color}"><div class="lb-head ai"><span class="lb-dev">${icon('crown')}</span>${host ? kindRow(s) : `<b>${AI_NAMES[s.difficulty] || ''} AI</b>`}</div></div>`;
    const m = state.machines.find((x) => x.id === s.owner);
    const hd = data.heroes.heroes[s.hero], rd = data.races.races[s.race];
    const field = cursors.get(s.key) || 'hero';
    const arrow = (act, d) => (own ? `<button class="lb-arrow" data-act="${act}" data-slot="${s.key}" data-d="${d}">${d < 0 ? '‹' : '›'}</button>` : '<span></span>');
    return `<div class="lb-slot local${s.ready ? ' ready' : ''}${own ? ' mine' : ''}" style="--team:${color}">
      <div class="lb-head"><span class="lb-dev">${String(s.device || '').startsWith('pad') ? icon('gamepad') : icon('keyboard')}</span><b>${s.name || 'Player'}</b>
        <span class="lb-devname">${own ? 'you' : m?.name || ''}${m && !m.host ? ` · ${m.ping} ms` : m?.host ? ' · host' : ''}${m?.hidden ? ' · (tab hidden)' : ''}</span></div>
      <div class="lb-row${own && field === 'hero' ? ' pfocus pf1' : ''}"><span class="lb-rl">Hero</span>${arrow('hero', -1)}<span class="lb-rv"><b>${hd?.name || s.hero}</b></span>${arrow('hero', 1)}</div>
      <div class="lb-row${own && field === 'race' ? ' pfocus pf1' : ''}"><span class="lb-rl">Army</span>${arrow('race', -1)}<span class="lb-rv"><b>${rd?.name || s.race}</b></span>${arrow('race', 1)}</div>
      ${own ? `<div class="lb-actions"><button class="lb-btn ready-btn" data-act="ready" data-slot="${s.key}">${s.ready ? `${icon('flag')} Ready` : 'Not ready'}</button><button class="lb-x" data-act="release" data-slot="${s.key}" data-tip="Leave this seat">×</button></div>` : `<div class="lb-actions"><span class="lb-btn ready-btn">${s.ready ? 'Ready' : 'Not ready'}</span></div>`}
    </div>`;
  }
  function kindRow(s) {
    const label = s.kind === 'ai' ? `AI · ${AI_NAMES[s.difficulty] || s.difficulty}` : s.kind === 'closed' ? 'Closed' : 'Open';
    return `<div class="lb-kind"><button class="lb-arrow" data-act="kind" data-slot="${s.key}" data-d="-1">‹</button><span>${label}</span><button class="lb-arrow" data-act="kind" data-slot="${s.key}" data-d="1">›</button></div>`;
  }

  function render() {
    if (!active || !state) return;
    const host = room.isHost;
    const ready = canStart();
    const https = `https://${location.hostname}:8441${location.pathname}`;
    root.innerHTML = `
      <header class="lb-top">
        <button class="lb-back" data-act="leave">‹ Leave room</button>
        <div class="lb-title"><h1>Online room</h1><span>${host ? 'You are the host' : 'Waiting for the host'} · ${state.format}</span></div>
        <div class="nr-code"><span>Room code</span><b>${state.code}</b><button class="lb-btn" data-act="copy" data-tip="Copy the code to send to a friend">Copy</button></div>
        <div class="lb-modes">${FORMATS.map((f) => `<button class="lb-mode${state.format === f ? ' on' : ''}" data-act="format" data-v="${f}" ${host ? '' : 'disabled'}>${f}</button>`).join('')}</div>
      </header>
      <div class="nr-machines">${state.machines.map((m) => `<span class="nr-m${m.hidden ? ' hidden' : ''}">${m.host ? icon('crown') : icon('people')}${m.name}${m.host ? '' : ` · ${m.ping} ms`}${m.hidden ? ' · tab hidden' : ''}${host && !m.host ? ` <button class="nr-kick" data-act="kick" data-id="${m.id}" data-tip="Remove this machine from the room">×</button>` : ''}</span>`).join('')}</div>
      <div class="lb-teams n${state.slots.length / 2}">
        ${[0, 1].map((t) => `<section class="lb-team t${t}" style="--team:${TEAM_CSS[t]}"><h2>${icon('flag')}${TEAM_NAMES[t]}</h2><div class="lb-slots">${state.slots.filter((s) => s.team === t).map(card).join('')}</div></section>`).join('<div class="lb-vs">vs</div>')}
      </div>
      <footer class="lb-foot">
        <div class="lb-status">${!mine().length ? 'Press <kbd>Enter</kbd> / <kbd>Space</kbd> or <kbd class="pad">A</kbd> to take a seat' : host ? (ready ? 'Everyone is ready — starting' : 'Waiting for every player to be ready') : 'Ready up — the match starts when everyone is ready'}</div>
        ${host ? `<button class="menu-btn primary nr-start" data-act="start" ${ready ? '' : 'disabled'}>Start the match</button>` : ''}
        ${gamepadsAvailable() ? '' : `<div class="lb-notice">${icon('gamepad')} Controllers only work on the secure page: <a href="${https}">${https}</a></div>`}
        ${toast ? `<div class="lb-flash">${toast}</div>` : ''}
      </footer>`;
  }

  return {
    attach(r) {
      detach();
      room = r; state = r.state;
      off.push(r.on('change', (s) => { state = s; render(); }));
      off.push(r.on('lobby', (s) => { if (s) state = s; render(); }));
      off.push(r.on('error', (e) => { toast = e.message; render(); }));
      off.push(devices.onJoin((dev) => claim(dev)));
      render();
    },
    get room() { return room; },
    show() { active = true; screen.hidden = false; toast = ''; readyFor = 0; started = false; render(); },
    hide() { active = false; screen.hidden = true; },
    frame,
    detach,
  };
}
