// Knockabout — the screens, in order:
//   title  ->  lobby ("press any button to join": every controller / keyboard half / the touch screen is its own
//              player, up to 8, each with Ready / Look / Leave, plus CPU players)  ->  builder (one player's look,
//              opened from the lobby)  ->  setup (mode, arena with a picture, rounds, difficulty, teams)  ->  match
//              ->  results (standings + rate the arena)  ->  vote (each local player picks the next arena)  ->  match …
// Menus work with a controller (d-pad / stick moves the ring, A picks, B goes back), the keyboard and the mouse / touch.
// The match runs in this page (local.js) — the seam an online version plugs into is described there.
import { createInput, deviceName, buttonsFor } from './input.js';
import { createNav } from './nav.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createTouch, isTouch } from './touch.js';
import { createSounds } from './sounds.js';
import { installFeedback, esc } from './feedback.js';
import { RATE_REASONS, rateArena, voteArena, tally } from './report.js';
import { loadLookData, avatarOf, randomLook, loadSlot, saveSlot, loadGuestSlot, wearOf } from './look.js';
import { installAccount } from './account.js';
import { openBuilder } from './builder.js';
import { createLocalSession } from './local.js';
import { loadSim, simKind } from './sim.js';
import { svgPortrait } from '../../../thousandvale/js/client/ui/svg-portrait.js';
import { installOnline } from './online-ui.js';

const COLORS = [
  { name: 'Red', color: '#ff4d4d' }, { name: 'Blue', color: '#3d8bff' }, { name: 'Green', color: '#3ecf5a' }, { name: 'Yellow', color: '#ffd23f' },
  { name: 'Pink', color: '#f04fd8' }, { name: 'Orange', color: '#ff8a2a' }, { name: 'Teal', color: '#2ad1c9' }, { name: 'Purple', color: '#9b6bff' },
];
const TEAMS = [{ name: 'Red Team', color: '#ff4d4d' }, { name: 'Blue Team', color: '#3d8bff' }, { name: 'Green Team', color: '#3ecf5a' }, { name: 'Yellow Team', color: '#ffd23f' }];
const NAMES = ['Pip', 'Bonk', 'Wobbles', 'Dot', 'Biscuit', 'Noodle', 'Taffy', 'Pickle', 'Scoot', 'Bean', 'Mops', 'Ziggy'];
const MAX = 8;
const $ = (s, r = document) => r.querySelector(s);

const S = {
  screen: 'boot', players: [], sim: null, arenas: [], modes: [], session: null, builder: null, last: null,
  settings: { mode: 'versus', arena: null, rounds: 3, difficulty: 'normal' }, matchCount: 0, history: [], lastEvents: [],
};
const input = createInput();
const sounds = createSounds();
const nav = createNav({ onMove: () => sounds('move'), onPress: () => sounds('tap') });
const screenEl = $('#screen');
const view = createRenderer($('#view'));
const hud = createHud($('#hud'));
const touch = createTouch($('#touch'), input);
const feedback = installFeedback({ view, nav, debug: () => ({ screen: S.screen, sim: simKind, settings: S.settings, players: S.players.map(p => ({ slot: p.slot, name: p.name, dev: p.dev, cpu: p.cpu, team: p.team })), match: S.session ? S.session.frame().b && { phase: S.session.frame().b.phase, round: S.session.frame().b.round, t: S.session.frame().b.t } : null, history: S.history.slice(-12), online: S.online ? { code: S.online.code, host: S.online.isHost, status: S.online.net?.status, ping: S.online.net?.ping, net: S.session?.stats || null } : null }) });
addEventListener('pointerdown', () => sounds.unlock(), { capture: true });
addEventListener('keydown', () => sounds.unlock(), { capture: true });
window.knockabout = S; S.view = view;      // for tests and the console

function go(screen) { S.screen = screen; S.history.push(screen); screenEl.className = screen; document.body.dataset.screen = screen; }
const humans = () => S.players.filter(p => !p.cpu);
const playerByDev = dev => S.players.find(p => p.dev === dev && !p.cpu);
const freeSlot = () => { for (let i = 0; i < MAX; i++) if (!S.players.some(p => p.slot === i)) return i; return -1; };
const portrait = look => { try { return svgPortrait(avatarOf(look)); } catch { return ''; } };
const arenaById = id => S.arenas.find(a => a.id === id) || S.arenas[0];
const modeById = id => S.modes.find(m => m.id === id) || S.modes[0] || { id, name: id };

// ---- accounts (2026-10-23, js/client/account.js): optional sign-in; signed in, this device's first player is the account's fighter
const isSlot0 = p => p && !p.cpu && !p.remote && (p.saveSlot ?? p.slot) === 0;
const acct = installAccount({
  toast: t => hud.toast(esc(t)),
  onProfile: data => {
    const p = S.players.find(isSlot0); if (!p) return;
    let d = data || loadGuestSlot(0);
    if (!d) { d = { look: randomLook(), name: NAMES[p.slot % NAMES.length] }; saveSlot(0, d); }    // signed out on a device that never had its own fighter
    p.look = d.look; if (d.name) p.name = d.name;
    if (S.builder) return;                                   // the builder is open on someone: the lobby redraws when it closes
    if (S.screen === 'lobby') drawLobby();
    else if (S.screen === 'room') { if (p.mine) S.online?.lookChanged(p); online.draw(); }
  },
});
window.knockaboutAccount = acct;

// ---- players -------------------------------------------------------------------------------------------------------
function addPlayer(dev, { cpu = false } = {}) {
  const slot = freeSlot(); if (slot < 0) return null;
  const saved = cpu ? null : loadSlot(slot);
  const look = saved?.look || randomLook(cpu ? mulberry(slot * 7919 + 13) : Math.random);
  const p = { slot, pid: slot + 1, dev: cpu ? null : dev, cpu, level: S.settings.difficulty, ready: cpu, look, color: COLORS[slot].color, team: slot % 2, name: saved?.name || (cpu ? 'CPU ' + NAMES[(slot * 5) % NAMES.length] : NAMES[slot % NAMES.length]) };
  p.colorName = COLORS[slot].name;
  S.players.push(p); S.players.sort((a, b) => a.slot - b.slot);
  if (!cpu && !saved) saveSlot(slot, { look, name: p.name });
  sounds('join');
  return p;
}
function removePlayer(p) { S.players = S.players.filter(x => x !== p); sounds('back'); }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---- title ---------------------------------------------------------------------------------------------------------
let demo = null;
async function showTitle() {
  go('title');
  screenEl.innerHTML = `<div class="title-wrap">
      <h1 class="logo">Knock<span>about</span></h1>
      <p class="tag-line">Grab, punch, wobble — and toss your friends out of the ring.</p>
      <div class="title-btns"><button class="btn huge primary" data-play data-autofocus>Play</button>
      <button class="btn big" data-how>How to play</button></div>
      <p class="press">Press any button on a controller or keyboard to start</p></div>`;
  nav.attach(screenEl, { keep: false });
  screenEl.querySelector('[data-play]').onclick = () => toLobby();
  screenEl.querySelector('[data-how]').onclick = () => showHow();
  screenEl.querySelector('.title-wrap').append(acct.button('title'));      // "Sign in" (optional), only where a Knockabout server is
  online?.decorateTitle(screenEl);      // "Host online" / "Join with code" / "Find a game", only when a server answers
  startDemo();
}
/** A CPU-only brawl behind the title screen (the real sim, so the title shows what the game is). */
async function startDemo() {
  stopDemo();
  if (!S.sim || !S.arenas.length) return;
  const arena = S.arenas[Math.floor(Math.random() * S.arenas.length)];
  const players = [0, 1, 2].map(i => ({ pid: 101 + i, name: NAMES[(i * 3) % NAMES.length], team: i, look: randomLook(mulberry(i * 31 + 5)), cpu: true, level: 'normal', color: COLORS[(i * 3) % 8].color }));
  try {
    const sess = createLocalSession(S.sim, { arena: arena.id, mode: 'versus', players, seed: (Math.random() * 1e9) | 0, difficulty: 'normal', rounds: 99 });
    demo = { sess, players };
    view.setArena(arena); view.frameAll = true; view.frameMode = 'arena';
    await view.syncFighters(sess.frame().b.fighters, f => { const p = players.find(x => x.pid === f.pid); return p ? { look: p.look, color: p.color } : goonInfo(f); });
  } catch (e) { console.warn('[knockabout] title demo failed', e); demo = null; }
}
function stopDemo() { if (demo) { demo.sess.dispose(); demo = null; view.clearFighters(); } }

function showHow() {
  const el = document.createElement('div'); el.className = 'modal how';
  const row = (what, k) => `<tr><td>${what}</td><td><kbd>${k.pad}</kbd></td><td><kbd>${k.kb1}</kbd></td><td><kbd>${k.kb2}</kbd></td><td><kbd>${k.touch}</kbd></td></tr>`;
  el.innerHTML = `<div class="panel"><h2>How to play</h2>
    <p>Grab, punch and throw the others out of the arena — or into its traps. Land a few punches in a row and your target is <b>knocked down</b> for a moment; every knockdown lasts longer than the one before. While someone is down you can pick them up and toss them.</p>
    <table class="keys"><tr><th></th><th>Controller</th><th>Keys (left)</th><th>Keys (right)</th><th>Phone</th></tr>
    ${row('Move', { pad: 'Stick', kb1: 'W A S D', kb2: 'Arrows', touch: 'Stick' })}
    ${row('Jump', { pad: 'A', kb1: 'Space', kb2: 'R-Ctrl / Num 0', touch: 'JUMP' })}
    ${row('Left hand: tap = punch, hold = grab', { pad: 'L1', kb1: 'Q', kb2: 'Num 7 / ,', touch: 'L' })}
    ${row('Right hand: tap = punch, hold = grab', { pad: 'R1', kb1: 'E', kb2: 'Num 9 / .', touch: 'R' })}
    ${row('Raise left arm', { pad: 'X', kb1: 'Z', kb2: 'Num 4 / K', touch: '▲L' })}
    ${row('Raise right arm', { pad: 'Y', kb1: 'C', kb2: 'Num 6 / L', touch: '▲R' })}
    ${row('Duck', { pad: 'B', kb1: 'Shift', kb2: 'R-Shift', touch: '—' })}
    ${row('Pause', { pad: 'Start', kb1: 'Esc', kb2: 'Backspace', touch: '☰' })}</table>
    <p class="note">Lift someone over your head: hold both grabs on them, raise both arms, then let go while you move or jump to throw. Hazards always warn first — a red glow, sparks or a shiver — so watch the floor.</p>
    <div class="row end"><button class="btn primary big" data-back data-autofocus>Got it</button></div></div>`;
  document.body.append(el);
  const prev = nav.root;
  const close = () => { el.remove(); S.modal = null; nav.attach(prev, { keep: false }); };
  el.querySelector('[data-back]').onclick = close;
  el.addEventListener('click', e => { if (e.target === el) close(); });
  S.modal = el; nav.attach(el.querySelector('.panel'), { keep: false });
}

// ---- lobby ---------------------------------------------------------------------------------------------------------
function toLobby() {
  stopDemo(); stopMatch();
  for (const p of humans()) p.ready = false;
  view.setArena(null); view.clearFighters(); view.frameAll = false; view.lookAt([0, 3, 12], [0, 1, 0], { instant: true });
  go('lobby'); drawLobby();
}
function drawLobby() {
  const cards = [];
  for (let i = 0; i < MAX; i++) {
    const p = S.players.find(x => x.slot === i);
    if (!p) { cards.push(`<div class="card empty" style="--seat:${COLORS[i].color}"><div class="join-hint">Press any button<br>to join</div><div class="card-btns">${isTouch() && !playerByDev('touch') ? `<button class="btn small primary" data-touchjoin>Tap to join</button>` : ''}<button class="btn small" data-addcpu="${i}">+ CPU</button></div></div>`); continue; }
    const B = buttonsFor(p.dev);
    cards.push(`<div class="card${p.ready ? ' ready' : ''}${p.cpu ? ' cpu' : ''}" style="--seat:${p.color}" data-slot="${i}">
      <div class="card-top"><b class="pname">${esc(p.name)}</b><span class="dev">${p.cpu ? 'CPU · ' + cap(p.level) : esc(deviceName(p.dev))}</span></div>
      <img class="face" src="${portrait(p.look)}" alt="">
      <div class="state">${p.cpu ? '' : p.ready ? 'Ready!' : p.dev === 'touch' ? 'Tap Ready when set' : `Press <kbd>${B.a}</kbd> when ready`}</div>
      <div class="card-btns">${p.cpu
        ? `<button class="btn small" data-level="${i}">Level</button><button class="btn small" data-look="${i}">Look</button><button class="btn small" data-remove="${i}">Remove</button>`
        : `<button class="btn small${p.ready ? '' : ' primary'}" data-ready="${i}">${p.ready ? 'Not ready' : 'Ready'}</button><button class="btn small" data-look="${i}">Look${kbd(B.y)}</button><button class="btn small" data-remove="${i}">Leave${kbd(B.b)}</button>`}</div></div>`);
  }
  const h = humans(), allReady = h.length && h.every(p => p.ready);
  screenEl.innerHTML = `<div class="lobby-wrap">
    <div class="bar"><button class="btn" data-back>‹ Back</button><h2>Who's playing?</h2><button class="btn primary" data-next ${S.players.length ? '' : 'disabled'}>${allReady ? 'Everyone ready ›' : 'Next ›'}</button></div>
    <p class="note center">Every controller, each half of the keyboard${isTouch() ? ' and this touch screen' : ''} is its own player. Up to ${MAX} fighters.</p>
    <div class="cards">${cards.join('')}</div></div>`;
  nav.attach(screenEl);
}
const cap = s => String(s || '').replace(/^./, c => c.toUpperCase());
const kbd = k => (k && k !== 'tap' && k !== 'back' ? ` <kbd>${k}</kbd>` : '');
screenEl.addEventListener('click', e => {
  const t = e.target; if (S.screen !== 'lobby') return;
  const slotOf = k => S.players.find(p => p.slot === +t.closest(`[${k}]`).getAttribute(k));
  if (t.closest('[data-back]')) { sounds('back'); return showTitle(); }
  if (t.closest('[data-next]')) { for (const p of humans()) p.ready = true; return toSetup(); }
  if (t.closest('[data-touchjoin]')) { addPlayer('touch'); return drawLobby(); }
  if (t.closest('[data-addcpu]')) { addPlayer(null, { cpu: true }); return drawLobby(); }
  if (t.closest('[data-remove]')) { removePlayer(slotOf('data-remove')); return drawLobby(); }
  if (t.closest('[data-ready]')) { const p = slotOf('data-ready'); p.ready = !p.ready; sounds('ready'); drawLobby(); return checkAllReady(); }
  if (t.closest('[data-level]')) { const p = slotOf('data-level'), L = ['easy', 'normal', 'hard']; p.level = L[(L.indexOf(p.level) + 1) % 3]; return drawLobby(); }
  if (t.closest('[data-look]')) return openLook(slotOf('data-look'));
});
function checkAllReady() {
  const h = humans();
  if (h.length && h.every(p => p.ready)) setTimeout(() => { if (S.screen === 'lobby' && !S.builder && humans().length && humans().every(p => p.ready)) toSetup(); }, 700);
}
function lobbyTick() {
  if (S.builder) return;
  for (const dev of input.devices()) {
    const e = input.edges(dev), p = playerByDev(dev);
    if (!p) {
      if (dev === 'touch') continue;
      if (e.b && !S.players.length) { sounds('back'); return showTitle(); }
      if (e.b || e.start && S.players.length) continue;
      if (addPlayer(dev)) drawLobby();
      continue;
    }
    if (e.a) { p.ready = !p.ready; sounds('ready'); drawLobby(); checkAllReady(); }
    else if (e.y) return openLook(p);
    else if (e.b) { if (p.ready) { p.ready = false; drawLobby(); } else { removePlayer(p); drawLobby(); } }
    else if (e.x) { const L = S.players.filter(x => x.cpu).length; if (L < MAX && freeSlot() >= 0) { addPlayer(null, { cpu: true }); drawLobby(); } }
  }
}
function openLook(p) {
  if (!p || S.builder) return;
  sounds('open');
  view.frameAll = false; screenEl.classList.add('dim'); screenEl.innerHTML = '';     // emptied, not just hidden: a stale layer over the canvas blanks WebGL on phones
  S.builder = openBuilder({ player: p, view, nav, sounds, root: document.body, account: isSlot0(p) ? acct.button('builder') : null,
    onChange: ({ look, name }) => { p.look = look; if (name) p.name = name; if (!p.cpu && !p.remote) saveSlot(p.saveSlot ?? p.slot, { look, name: p.name }); if (p.mine) S.online?.lookChanged(p); },
    onClose: () => { S.builder = null; screenEl.classList.remove('dim'); view.lookAt([0, 3, 12], [0, 1, 0]); if (S.screen === 'lobby') drawLobby(); else if (S.screen === 'room') online.draw(); },
  });
  S.builderDev = p.cpu ? null : p.dev;
}

// ---- setup: mode, arena, rounds, difficulty, teams -----------------------------------------------------------------
function toSetup() {
  if (S.screen === 'setup') return;
  if (!S.settings.arena) S.settings.arena = S.arenas[0]?.id;
  go('setup'); drawSetup();
}
function drawSetup() {
  const st = S.settings, mode = modeById(st.mode), n = S.players.length;
  const minP = mode.minPlayers ?? (mode.id === 'waves' ? 1 : 2);
  const teamsOk = st.mode !== 'teams' || new Set(S.players.map(p => p.team)).size >= 2;
  const ok = n >= minP && teamsOk;
  const arena = arenaById(st.arena);
  screenEl.innerHTML = `<div class="setup-wrap">
    <div class="bar"><button class="btn" data-back>‹ Players</button><h2>Pick a game</h2><button class="btn primary big" data-fight ${ok ? '' : 'disabled'} data-autofocus>Fight!</button></div>
    ${ok ? '' : `<p class="warn">${n < minP ? `${esc(mode.name)} needs at least ${minP} fighters. <button class="btn small" data-cpu>+ Add a CPU</button>` : 'Put players on at least two teams.'}</p>`}
    <div class="sec"><h3>Mode</h3><div class="modes">${S.modes.map(m => `<button class="mode${m.id === st.mode ? ' on' : ''}" data-mode="${m.id}"><b>${esc(m.name)}</b><span>${esc(m.blurb || '')}</span></button>`).join('')}</div></div>
    <div class="sec"><h3>Arena</h3><div class="arenas">${S.arenas.map(a => `<button class="arena${a.id === st.arena ? ' on' : ''}" data-arena="${a.id}"><img src="${view.arenaPicture(a)}" alt=""><b>${esc(a.name)}</b></button>`).join('')}<button class="arena random${st.arena === '*' ? ' on' : ''}" data-arena="*"><span class="dice">?</span><b>Surprise me</b></button></div>
      <p class="arena-about">${st.arena === '*' ? 'A different arena each match.' : `<b>${esc(arena?.name || '')}</b> — ${esc(arena?.blurb || '')} <i>${esc(arena?.trick || '')}</i>`}</p></div>
    <div class="sec opts">
      ${st.mode === 'waves' ? '' : `<div class="opt"><h3>Rounds to win</h3><div class="pills">${[1, 2, 3, 5].map(r => `<button class="pill${st.rounds === r ? ' on' : ''}" data-rounds="${r}">${r}</button>`).join('')}</div></div>`}
      <div class="opt"><h3>${st.mode === 'waves' ? 'Goons' : 'CPU players'}</h3><div class="pills">${['easy', 'normal', 'hard'].map(d => `<button class="pill${st.difficulty === d ? ' on' : ''}" data-diff="${d}">${cap(d)}</button>`).join('')}</div></div>
    </div>
    ${st.mode === 'teams' ? `<div class="sec"><h3>Teams <span class="note">(press a player to switch team)</span></h3><div class="teams">${S.players.map(p => `<button class="tchip" style="--seat:${TEAMS[p.team].color}" data-team="${p.slot}"><img src="${portrait(p.look)}" alt=""><span>${esc(p.name)}</span><i>${TEAMS[p.team].name}</i></button>`).join('')}</div></div>` : ''}
  </div>`;
  nav.attach(screenEl);
}
screenEl.addEventListener('click', e => {
  const t = e.target; if (S.screen !== 'setup') return;
  const st = S.settings;
  if (t.closest('[data-back]')) { sounds('back'); return toLobby(); }
  if (t.closest('[data-fight]')) return startMatch();
  if (t.closest('[data-cpu]')) { addPlayer(null, { cpu: true }); return drawSetup(); }
  const m = t.closest('[data-mode]'); if (m) { st.mode = m.dataset.mode; return drawSetup(); }
  const a = t.closest('[data-arena]'); if (a) { st.arena = a.dataset.arena; return drawSetup(); }
  const r = t.closest('[data-rounds]'); if (r) { st.rounds = +r.dataset.rounds; return drawSetup(); }
  const d = t.closest('[data-diff]'); if (d) { st.difficulty = d.dataset.diff; for (const p of S.players) if (p.cpu) p.level = st.difficulty; return drawSetup(); }
  const tm = t.closest('[data-team]'); if (tm) { const p = S.players.find(x => x.slot === +tm.dataset.team); const nT = Math.min(4, Math.max(2, S.players.length)); p.team = (p.team + 1) % nT; return drawSetup(); }
});

// ---- the match -----------------------------------------------------------------------------------------------------
let lastPhase = null, overAt = 0, curArena = null;
const goonLooks = new Map();
function goonInfo(f) {
  if (!goonLooks.has(f.pid)) {
    const L = randomLook(mulberry(f.pid * 977 + 3));
    L.wear = { ...L.wear, top: { id: 'tshirt', color: '#5a5f6a' }, bottom: { id: 'pants', color: '#3a3d45' }, hat: { id: 'bandana', color: '#2a2a2a' }, cape: { id: 'none' }, decor: { id: 'none' } };
    goonLooks.set(f.pid, L);
  }
  return { look: goonLooks.get(f.pid), color: '#9aa3ad', name: f.bot && !S.players.some(p => p.pid === f.pid) ? 'Goon' : null };
}
function infoFor(f) {
  const p = S.players.find(x => x.pid === f.pid);
  if (!p) return goonInfo(f);
  return { look: p.look, color: S.settings.mode === 'teams' ? TEAMS[p.team].color : p.color, name: p.name };
}
async function startMatch(arenaId = null, onlineSess = null) {
  const st = S.settings;
  let id = arenaId || st.arena;
  if (id === '*' || !id) id = S.arenas[Math.floor(Math.random() * S.arenas.length)].id;
  curArena = arenaById(id);
  stopDemo(); stopMatch();
  go('match'); screenEl.innerHTML = `<div class="loading">Getting the fighters ready…</div>`;
  const players = S.players.map(p => ({ pid: p.pid, name: p.name, team: st.mode === 'waves' ? 0 : st.mode === 'versus' ? p.slot : p.team, look: { race: p.look.race, seed: p.look.seed }, cpu: p.cpu, level: p.cpu ? p.level : undefined }));
  let sess = onlineSess;      // online: js/client/online.js built it from the server's 'start' (same shape as local.js)
  if (!sess) try { sess = createLocalSession(S.sim, { arena: curArena.id, mode: st.mode, players, seed: (Math.random() * 1e9) | 0, difficulty: st.difficulty, rounds: st.rounds }); }
  catch (e) { console.error('[knockabout] could not start the match', e); screenEl.innerHTML = `<div class="loading">That match would not start: ${esc(e.message)}<br><button class="btn" data-back>Back</button></div>`; screenEl.querySelector('[data-back]').onclick = () => toSetup(); return; }
  view.setArena(curArena); view.frameAll = true; view.frameMode = 'fighters';
  await view.syncFighters(sess.frame().b.fighters, infoFor);
  if (S.screen !== 'match') { sess.dispose(); return; }
  S.session = sess; lastPhase = null; overAt = 0; S.matchCount++; S.lastEvents = [];
  screenEl.innerHTML = '';
  hud.show(true);
  touch.show(!!playerByDev('touch'));
  tally('match_start', { arena: curArena.id, mode: st.mode, humans: humans().length, cpus: S.players.length - humans().length, sim: sess.kind === 'online' ? 'online' : simKind });
  const B = h => buttonsFor(h.dev);
  const here = humans().filter(p => !p.remote);
  hud.hint(here.length === 1 && here[0].dev !== 'touch' ? `<kbd>${B(here[0]).grabL}</kbd>/<kbd>${B(here[0]).grabR}</kbd> tap = punch, hold = grab · <kbd>${B(here[0]).raiseL}</kbd>/<kbd>${B(here[0]).raiseR}</kbd> raise · <kbd>${B(here[0]).jump}</kbd> jump` : '');
}
function stopMatch() {
  if (S.session) { S.session.dispose(); S.session = null; }
  hud.show(false); touch.show(false); hidePause();
  if (S.screen !== 'match') view.clearFighters();
}
function whoFor(k, teamMode) {
  if (teamMode) { const t = TEAMS[+k]; return t ? { name: t.name, color: t.color } : null; }
  const p = S.players.find(x => String(x.pid) === String(k)); return p ? { name: p.name, color: p.color } : k === 'players' ? { name: 'Team', color: '#fff' } : null;
}
function nameOf(pid) { const p = S.players.find(x => x.pid === pid); return p ? p.name : 'a goon'; }
function colorOf(pid) { const p = S.players.find(x => x.pid === pid); return p ? (S.settings.mode === 'teams' ? TEAMS[p.team].color : p.color) : '#9aa3ad'; }
function onEvents(evs, snap) {
  const byPid = new Map(snap.fighters.map(f => [f.pid, f]));
  S.lastEvents.push(...evs.map(ev => ({ ...ev, t: snap.t }))); if (S.lastEvents.length > 10) S.lastEvents.splice(0, S.lastEvents.length - 10);
  const pan = x => Math.max(-1, Math.min(1, (view.toScreen(x, 0, 0).x / innerWidth) * 2 - 1));
  for (const ev of evs) {
    switch (ev.e) {
      case 'punch': view.fx.punch(ev.x, ev.y, ev.z, colorOf(ev.pid), ev.hit != null, view.camera); sounds(ev.hit != null ? 'punch' : 'whiff', { pan: pan(ev.x) }); break;
      case 'grab': { const f = byPid.get(ev.pid), h = f?.hands?.[ev.hand]; if (h) view.fx.spark(h[0], h[1], h[2]); sounds('grab', { gap: 0.1 }); break; }
      case 'throw': { const f = byPid.get(ev.pid); if (f) view.fx.whoosh(f.torso[0], f.torso[1] + 0.6, f.torso[2]); sounds('throw'); break; }
      case 'down': sounds('down'); break;
      case 'out': {
        const f = byPid.get(ev.pid), P = view.puppets.get(ev.pid), pos = P && typeof P === 'object' && P.lastPos ? P.lastPos : f ? { x: f.torso[0], y: f.torso[1], z: f.torso[2] } : null;
        if (pos) { if (ev.how === 'fire') view.fx.soot(pos.x, Math.max(pos.y, (curArena?.outY ?? -6) + 2), pos.z); else view.fx.poof(pos.x, Math.max(pos.y, (curArena?.outY ?? -6) + 2), pos.z); }
        sounds(ev.how === 'spikes' ? 'spikes' : ev.how === 'crush' ? 'crush' : ev.how === 'fire' ? 'fire' : 'out');
        const how = { ring: 'flew out of the arena', spikes: 'landed on the spikes', fire: 'got toasted', crush: 'got squashed flat' }[ev.how] || 'is out';
        hud.toast(`<b>${esc(nameOf(ev.pid))}</b> ${how}${ev.by != null && ev.by !== ev.pid ? ` <span>thanks to ${esc(nameOf(ev.by))}</span>` : ''}`, colorOf(ev.pid));
        break;
      }
      case 'round': {
        const w = ev.winner, mode = S.settings.mode;
        const txt = w == null || w === -1 ? 'Nobody wins this one!' : mode === 'teams' ? `${TEAMS[w]?.name || 'A team'} wins the round!` : mode === 'waves' ? (w === 'goons' || w === false ? 'The goons got you!' : 'Wave cleared!') : `${nameOf(w)} wins the round!`;
        hud.banner(txt, { secs: 2.4, cls: 'win' }); sounds('round'); break;
      }
      case 'wave': hud.banner(`Wave ${ev.n}`, { secs: 1.8 }); sounds('wave'); break;
      case 'hazard': sounds('hazard', { gap: 0.4, pan: 0 }); break;
      case 'over': overAt = performance.now() + 2600; sounds('win'); break;
    }
  }
}
function matchTick(dt) {
  const sess = S.session; if (!sess) return;
  // input: each local human's own device
  for (const p of humans()) sess.setInput(p.pid, S.pauseNav ? {} : input.held(p.dev));
  for (const p of humans()) { const e = input.edges(p.dev); if (e.start) { togglePause(); break; } }
  if (sess.paused) { if (S.pauseNav) nav.handle(anyEdges()); return; }
  if (S.pauseNav) nav.handle(anyEdges());      // online: the menu is open but the match goes on
  sess.tick(dt);
  const fr = sess.frame(), snap = fr.b;
  const evs = sess.drain(); if (evs.length) onEvents(evs, snap);
  // fighters that appeared since the start (wave goons)
  if (snap.fighters.some(f => !view.puppets.has(f.pid) && !view.puppets.has('pending' + f.pid))) view.syncFighters(snap.fighters, infoFor);
  view.drawMatch(fr, dt);
  hud.update(snap, { who: whoFor, teamMode: S.settings.mode === 'teams', waves: S.settings.mode === 'waves' });
  if (snap.phase !== lastPhase) {
    if (snap.phase === 'intro') hud.banner(S.settings.mode === 'waves' ? `Wave ${snap.wave ?? 1}` : `Round ${snap.round}`, { secs: 1.6 });
    if (snap.phase === 'fight' && lastPhase !== 'fight') { hud.banner('Fight!', { secs: 0.9, cls: 'go' }); sounds('go'); }
    lastPhase = snap.phase;
  }
  if ((sess.over || snap.phase === 'over') && !overAt) overAt = performance.now() + 2200;
  if (overAt && performance.now() > overAt) { S.last = { result: sess.result(), arena: curArena, mode: S.settings.mode }; showResults(); }
}
function anyEdges() {
  const out = { up: false, down: false, left: false, right: false, a: false, b: false, x: false, y: false, start: false };
  for (const d of input.devices()) { const e = input.edges(d); for (const k in out) out[k] = out[k] || e[k]; }
  return out;
}
function togglePause() { if (!S.session) return; if (S.session.paused) hidePause(); else showPause(); }
function showPause() {
  S.session.paused = true; sounds('open');
  const el = document.createElement('div'); el.className = 'modal pause';
  const on = S.session.kind === 'online';
  el.innerHTML = on ? `<div class="panel"><h2>Menu</h2><p class="note">An online match keeps going while this is open.</p><div class="col"><button class="btn big primary" data-resume data-back data-autofocus>Keep playing</button><button class="btn big" data-how2>How to play</button>${online.isHost ? '<button class="btn big" data-end>End the match for everyone</button>' : ''}<button class="btn big" data-quit>Leave the room</button></div></div>`
    : `<div class="panel"><h2>Paused</h2><div class="col"><button class="btn big primary" data-resume data-back data-autofocus>Keep playing</button><button class="btn big" data-restart>Start this match again</button><button class="btn big" data-how2>How to play</button><button class="btn big" data-quit>Back to the players</button></div></div>`;
  document.body.append(el); S.pauseNav = el;
  nav.attach(el.querySelector('.panel'), { keep: false });
  el.querySelector('[data-resume]').onclick = () => hidePause();
  if (!on) el.querySelector('[data-restart]').onclick = () => { hidePause(); startMatch(curArena.id); };
  el.querySelector('[data-how2]').onclick = () => showHow();
  if (on && online.isHost) el.querySelector('[data-end]').onclick = () => { hidePause(); online.end(); };
  el.querySelector('[data-quit]').onclick = () => { hidePause(); stopMatch(); if (on) online.leave(); else toLobby(); };
}
function hidePause() { if (S.pauseNav) { S.pauseNav.remove(); S.pauseNav = null; } if (S.session) S.session.paused = false; }

// ---- results + rating ----------------------------------------------------------------------------------------------
function showResults() {
  const L = S.last, res = L.result, mode = L.mode;
  stopMatch(); go('results');
  const order = res.order || [];
  const scores = res.scores || {};
  const rows = order.map((grp, i) => grp.map(pid => {
    const p = S.players.find(x => x.pid === pid) || (mode === 'teams' ? null : null);
    if (mode === 'teams' && !p) { const t = TEAMS[pid]; return t ? `<div class="srow" style="--seat:${t.color}"><span class="place">${i + 1}</span><b>${t.name}</b><span class="pts">${scores[pid] ?? 0}</span></div>` : ''; }
    if (!p) return '';
    const sc = mode === 'teams' ? scores[p.team] : scores[pid];
    return `<div class="srow${i === 0 ? ' first' : ''}" style="--seat:${p.color}"><span class="place">${i + 1}</span><img src="${portrait(p.look)}" alt=""><b>${esc(p.name)}</b><span class="pts">${sc ?? 0}${mode === 'waves' ? ' waves' : ''}</span></div>`;
  }).join('')).join('');
  const top = order[0]?.[0], tp = S.players.find(x => x.pid === top);
  const head = mode === 'waves' ? 'Nice teamwork!' : mode === 'teams' ? `${TEAMS[tp ? tp.team : top]?.name || 'A team'} wins!` : tp ? `${esc(tp.name)} wins!` : 'Match over!';
  screenEl.innerHTML = `<div class="results-wrap">
    <h2 class="shout">${head}</h2>
    <div class="panel standings">${rows || '<p>No scores this time.</p>'}</div>
    <div class="panel rate"><h3>How was <b>${esc(L.arena.name)}</b>?</h3>
      <div class="row thumbs"><button class="thumb" data-v="1" aria-label="thumbs up">👍</button><button class="thumb" data-v="-1" aria-label="thumbs down">👎</button></div>
      <div class="reasons"></div><p class="note rated"></p></div>
    <div class="row end">${S.online ? `<button class="btn" data-leave>Leave the room</button>${online.isHost ? '<button class="btn" data-room>Back to the room</button>' : ''}` : '<button class="btn" data-lobby>Players</button><button class="btn" data-setup>Change game</button>'}<button class="btn primary big" data-vote data-autofocus>Next arena ›</button></div></div>`;
  let v = 0, why = new Set(), sent = false;
  const reasonsEl = $('.reasons', screenEl);
  const drawReasons = () => { reasonsEl.innerHTML = v ? (v > 0 ? RATE_REASONS.up : RATE_REASONS.down).map(([id, label]) => `<button class="pill small${why.has(id) ? ' on' : ''}" data-why="${id}">${label}</button>`).join('') + `<button class="btn small primary" data-send>${sent ? 'Saved ✓' : 'Send'}</button>` : ''; nav.attach(screenEl); };
  const send = () => { if (!v || sent) return; sent = true; if (S.online) S.online.rate(v, [...why].join(',')); else rateArena({ arena: L.arena.id, mode, v, why: [...why].join(','), players: humans().length }); $('.rated', screenEl).textContent = 'Thanks — that helps us tune the arenas.'; drawReasons(); };
  screenEl.onclick = e => {
    const t = e.target;
    const th = t.closest('[data-v]'); if (th) { v = +th.dataset.v; sent = false; why = new Set(); screenEl.querySelectorAll('.thumb').forEach(b => b.classList.toggle('on', b === th)); return drawReasons(); }
    const w = t.closest('[data-why]'); if (w) { why.has(w.dataset.why) ? why.delete(w.dataset.why) : why.add(w.dataset.why); sent = false; return drawReasons(); }
    if (t.closest('[data-send]')) return send();
    if (t.closest('[data-vote]')) { send(); return S.online ? online.showVote() : showVote(); }
    if (t.closest('[data-leave]')) { send(); return online.leave(); }
    if (t.closest('[data-room]')) { send(); return online.end(); }
    if (t.closest('[data-setup]')) { send(); return toSetup(); }
    if (t.closest('[data-lobby]')) { send(); return toLobby(); }
  };
  nav.attach(screenEl, { keep: false });
  view.frameAll = false; view.lookAt([0, 9, 15], [0, 0, 0]);
}

// ---- vote for the next arena (every local player picks with their own controller) ----------------------------------
function showVote() {
  go('vote');
  const others = S.arenas.filter(a => a.id !== S.last?.arena?.id).sort(() => Math.random() - 0.5);
  const choices = [...others.slice(0, 2), S.last?.arena].filter(Boolean).slice(0, 3);
  const voters = humans();
  const pick = new Map(voters.map((p, i) => [p.pid, i % choices.length])), locked = new Set();
  let ends = performance.now() + 20000, done = false;
  function draw() {
    screenEl.innerHTML = `<div class="vote-wrap"><h2 class="shout">Vote for the next arena</h2>
      <p class="note center">${voters.some(p => p.dev !== 'touch') ? 'Left / right to choose, A to lock in. ' : ''}Tap a card to vote. <span class="timer"></span></p>
      <div class="vchoices">${choices.map((a, i) => `<button class="vcard" data-choice="${i}"><img src="${view.arenaPicture(a)}" alt=""><b>${esc(a.name)}${a.id === S.last?.arena?.id ? ' <i>(again)</i>' : ''}</b><div class="voters">${voters.filter(p => pick.get(p.pid) === i).map(p => `<span class="vdot${locked.has(p.pid) ? ' locked' : ''}" style="--seat:${p.color}" title="${esc(p.name)}">${esc(p.name.slice(0, 1))}</span>`).join('')}</div></button>`).join('')}</div>
      <div class="row end"><button class="btn" data-back>Back</button><button class="btn primary big" data-go>Go!</button></div></div>`;
    nav.attach(screenEl);
  }
  function finish() {
    if (done) return; done = true;
    const count = choices.map((_, i) => voters.filter(p => pick.get(p.pid) === i).length);
    const best = Math.max(...count), tied = choices.map((_, i) => i).filter(i => count[i] === best);
    const win = tied[Math.floor(Math.random() * tied.length)];
    voteArena({ choices: choices.map(a => a.id), votes: count, picked: choices[win].id });
    S.voteTick = null;
    startMatch(choices[win].id);
  }
  screenEl.onclick = e => {
    const c = e.target.closest('[data-choice]');
    if (c) { const p = voters.find(x => !locked.has(x.pid)) || voters[0]; if (p) { pick.set(p.pid, +c.dataset.choice); locked.add(p.pid); sounds('tap'); draw(); if (locked.size >= voters.length) setTimeout(finish, 500); } return; }
    if (e.target.closest('[data-go]')) return finish();
    if (e.target.closest('[data-back]')) { S.voteTick = null; return showResults(); }
  };
  S.voteTick = () => {
    for (const p of voters) {
      if (!p.dev || p.dev === 'touch') continue;
      const e = input.edges(p.dev);
      if (!locked.has(p.pid) && (e.left || e.right)) { pick.set(p.pid, (pick.get(p.pid) + (e.right ? 1 : -1) + choices.length) % choices.length); sounds('move'); draw(); }
      if (e.a && !locked.has(p.pid)) { locked.add(p.pid); sounds('ready'); draw(); if (locked.size >= voters.length) setTimeout(finish, 500); }
      else if (e.b && locked.has(p.pid)) { locked.delete(p.pid); draw(); }
    }
    const left = Math.max(0, Math.ceil((ends - performance.now()) / 1000));
    const tm = $('.timer', screenEl); if (tm) tm.textContent = `${left}s`;
    if (left <= 0) finish();
  };
  if (!voters.length) return finish();
  draw();
}

// ---- online play (js/client/online-ui.js): the room screen, joining by code / link / QR, the room-wide vote --------
const online = installOnline({ S, view, nav, sounds, input, screenEl, hud, esc, cap, portrait, COLORS, TEAMS, MAX, NAMES, arenaById, modeById, openLook, showTitle, startMatch, stopMatch, showResults, go, isTouch, deviceName, buttonsFor, loadSlot, saveSlot, randomLook });

// ---- game-eye: a small JSON summary for Claude's headless player (~/claude/game-eye) --------------------------------
const r2 = v => Math.round(v * 100) / 100;
window.gameEye = {
  state() {
    const snap = S.session?.frame().b || null;
    return {
      screen: S.screen, sim: simKind, builderOpen: !!S.builder, paused: !!S.session?.paused,
      players: S.players.map(p => ({ slot: p.slot, pid: p.pid, device: p.dev, name: p.name, cpu: !!p.cpu, ready: !!p.ready, team: p.team })),
      mode: S.settings.mode, arena: curArena?.id || S.settings.arena, rounds: S.settings.rounds, difficulty: S.settings.difficulty,
      focus: document.querySelector('.nav-focus')?.textContent?.trim().slice(0, 40) || null,
      online: S.online ? { code: S.online.code, host: S.online.isHost, status: S.online.net?.status, ping: S.online.net?.ping, net: S.session?.stats || null } : null,
      match: snap ? {
        phase: snap.phase, round: snap.round, rounds: snap.rounds, wave: snap.wave, timeLeft: snap.timeLeft != null ? Math.round(snap.timeLeft) : null, score: snap.score,
        fighters: snap.fighters.map(f => ({ pid: f.pid, name: S.players.find(p => p.pid === f.pid)?.name || (f.bot ? 'Goon' : null), team: f.team, alive: f.alive, pos: f.torso.slice(0, 3).map(r2), down: r2(f.down || 0), daze: r2(f.daze || 0), grip: f.grip, raise: f.raise, out: f.out })),
        events: S.lastEvents.slice(-10),
      } : null,
    };
  },
};

// ---- the frame loop ------------------------------------------------------------------------------------------------
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  input.poll();
  try {
    if (feedback.isOpen || S.modal) { nav.handle(anyEdges()); }
    else if (S.builder) { S.builder.tick(dt, S.builderDev ? input.edges(S.builderDev) : null); if (!S.builderDev) nav.handle(anyEdges()); }
    else if (S.screen === 'title') {
      const devs = input.devices();
      if (devs.length) { const e = input.edges(devs[0]); if (e.up || e.down || e.left || e.right) nav.handle(e); else if (devs[0] !== 'touch') { toLobby(); if (!playerByDev(devs[0])) { addPlayer(devs[0]); drawLobby(); } } }
    }
    else if (S.screen === 'lobby') { lobbyTick(); const e = anyEdges(); if (e.up || e.down || e.left || e.right) { /* lobby arrows only move the ring when nobody uses them to play */ if (!humans().length) nav.handle(e); } }
    else if (S.screen === 'setup' || S.screen === 'results') { const e = anyEdges(); if (e.start) e.a = true; nav.handle(e); }
    else if (S.screen === 'vote') S.voteTick?.();
    else if (S.screen === 'room') online.tick(dt);
    if (S.screen === 'match') matchTick(dt);
    else if (demo && S.screen === 'title') { demo.sess.tick(dt); demo.sess.drain(); view.drawMatch(demo.sess.frame(), dt); if (demo.sess.over) startDemo(); }
  } catch (e) { console.error('[knockabout] frame', e); }
  view.render(dt);
  requestAnimationFrame(frame);
}

// ---- boot ----------------------------------------------------------------------------------------------------------
(async function boot() {
  try {
    const [sim] = await Promise.all([loadSim(), loadLookData()]);
    S.sim = sim;
    S.arenas = (sim.ARENAS?.arenas || sim.ARENAS || []).filter(a => a && a.id);
    const M = sim.MODES?.modes || sim.MODES || [];
    S.modes = M.length ? M : [{ id: 'versus', name: 'Versus' }, { id: 'teams', name: 'Teams' }, { id: 'waves', name: 'Waves' }];
    S.settings.arena = S.arenas[0]?.id;
  } catch (e) { console.error('[knockabout] boot', e); }
  document.body.dataset.sim = simKind;
  $('#boot')?.remove();
  view.setArena(null);
  requestAnimationFrame(frame);
  const q = new URLSearchParams(location.search);
  if (q.get('code') && online.joinCode(q.get('code'))) { /* an invite link: straight into that room */ }
  else if (q.get('screen') === 'lobby') toLobby(); else showTitle();
  tally('page_view', { touch: isTouch() ? 1 : 0 });
})();
