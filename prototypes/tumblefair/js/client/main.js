// Tumblefair in the browser: one page for every device. A phone that joins is a player (it sees the game AND holds
// the controls); a TV or laptop can join as "the big screen" (it only watches). This file owns the screens — title,
// lobby, board, vote, minigame intro, results, final — and hands the 3D work to stage / lineup / boardview / play.
import { connect } from './net.js';
import { createStage } from './stage.js';
import { createControls, isTouch } from './controls.js';
import { createLineup } from './lineup.js';
import { createBoardView, SPACE_LOOK } from './boardview.js';
import { createPlay } from './play.js';
import { loadAvatarData, portrait, costumes, RACES, RACE_NAMES } from './avatars.js';
import { SEASONS, seasonByDate, seasonName, inSeason } from '../shared/seasons.js';
import { qrSvg, joinUrl } from './qr.js';
import { h, esc } from './gamehud.js';
import { createEditor } from './editor.js';
import { btnText } from './buttons.js';
import { createPadNav } from './padnav.js';
import { createSounds } from './sounds.js';
import { installFeedback } from './feedback.js';
import { SEATS, cleanCode, CODE_LENGTH, RATE_REASONS } from '../shared/protocol.js';
import { tally, deviceKind } from './tally.js';
import { GAMES, gameIds } from '../games/metas.js';     // meta only: the rules stay on the server

const $ = s => document.querySelector(s);
const screen = $('#screen'), hud = $('#hud'), toasts = $('#toasts');
const ART = new URL('../../assets/art/', import.meta.url).href;
const q = new URLSearchParams(location.search);
const S = { codeSmall: (() => { try { return !!localStorage.getItem('tumblefair.codeSmall'); } catch { return false; } })(), me: null, room: null, phase: null, pm: null, play: null, playP: null, board: null, boardP: null, modal: null, ends: 0, bd: { tickets: {}, ribbons: {}, pid: null, ask: null, rolled: null }, votes: {}, skips: [], asDisplay: q.get('display') === '1', err: '', rated: {}, pub: null };

await loadAvatarData();
const stage = createStage($('#view'));
const controls = createControls($('#controls'));
const lineup = createLineup(stage);
const sfx = createSounds();
const net = connect();
const BOARDS = Object.fromEntries(await Promise.all(['fairground', 'pier'].map(async id => [id, await (await fetch(new URL(`../../data/boards/${id}.json`, import.meta.url))).json()])));
window.tumblefair = { S, net, stage, lineup, controls, GAMES };
// game-eye (~/claude/game-eye, 2026-10-23): a small summary of what is going on, so Claude can play along and read the
// game without screenshots — phase, room, players, the board turn, and the minigame's own public state (trimmed).
window.gameEye = { state() {
  const r = S.room, gs = S.play?.state;
  let game = null; try { const j = gs ? JSON.stringify(gs) : ''; game = !gs ? null : j.length <= 3000 ? gs : { keys: Object.keys(gs), size: j.length, head: j.slice(0, 1500) }; } catch { game = '(unreadable)'; }
  return { phase: S.phase, me: S.me?.name, room: r ? { code: r.code, you: r.you, host: r.host, opts: r.opts, season: r.season, members: r.members.map(m => ({ pid: m.pid, name: m.name, seat: m.seat, display: !!m.display, on: m.on })) } : null,
    match: r?.match ? { mode: r.match.mode, round: r.match.round, rounds: r.match.rounds, points: r.match.points } : null,
    minigame: S.pm?.game || null, controls: S.pm?.game ? GAMES[S.pm.game]?.meta.controls || GAMES[S.pm.game]?.meta.kind : null,
    board: S.phase === 'board' ? { turn: S.bd.pid, sub: S.bd.sub, ask: S.bd.ask, tickets: S.bd.tickets, ribbons: S.bd.ribbons, bulletin: S.bd.mods } : null,
    gameState: game, modal: S.modal ? (S.modal.el?.className || 'modal') : null, err: S.err || null };
} };
/** The holiday look of the menus (round 6): body[data-season], plus a few bats crossing the sky at Halloween. */
function setSeason(id) {
  if (document.body.dataset.season === (id || '')) return;
  document.body.dataset.season = id || '';
  document.querySelector('.bats')?.remove();
  if (id === 'halloween') { const b = document.createElement('div'); b.className = 'bats'; b.innerHTML = '<i></i><i></i><i></i>'; document.body.append(b); }
}
setSeason(seasonByDate());
const fb = installFeedback({ stage, net, getS: () => S });            // for tests and the console; fb.open() = the form (round 7: "Tell us more")
tally('page_view', { device: deviceKind(), invite: !!q.get('code'), display: q.get('display') === '1' });

// ------------------------------------------------------------------ helpers
const members = () => S.room?.members || [];
const mine = () => members().find(m => m.pid === S.room?.you) || null;
const seatOf = m => (m?.seat != null ? SEATS[m.seat] : null);
const isHost = () => S.room && S.room.host === S.room.you;
const seated = () => members().filter(m => m.seat != null).sort((a, b) => a.seat - b.seat);
const left = () => Math.max(0, Math.ceil((S.ends - performance.now()) / 1000));
function toast(text, cls = '') { const e = h('div', 'toast ' + cls); e.textContent = text; toasts.append(e); setTimeout(() => e.classList.add('out'), 2600); setTimeout(() => e.remove(), 3100); }
const face = m => `<i class="face">${m?.look ? `<img src="${portrait(m)}" alt="">` : ''}</i>`;
const chipOf = (m, extra = '') => { const s = seatOf(m); return `<span class="chip${m.pid === S.room?.you ? ' me' : ''}${m.on === false ? ' off' : ''}" data-pid="${m.pid}" ${s ? `data-shape="${s.shape}" style="--seat:${s.color};--seat-dark:${s.dark}"` : ''}>${face(m)}<b class="nm">${esc(m.name)}</b>${extra}</span>`; };
const DUCK = `<svg viewBox="0 0 64 56" class="duck-svg" aria-hidden="true"><ellipse cx="30" cy="38" rx="24" ry="14" fill="currentColor" stroke="#12222a" stroke-width="3"/><circle cx="44" cy="20" r="12" fill="currentColor" stroke="#12222a" stroke-width="3"/><path d="M54 20 l9 3 -9 4z" fill="#ff8a1a" stroke="#12222a" stroke-width="2"/><circle cx="47" cy="17" r="2.6" fill="#12222a"/><path d="M14 34 q10 -8 20 2" fill="none" stroke="#12222a" stroke-width="2.5" opacity=".5"/></svg>`;
const ICON = {
  ticket: '<svg class="ic" viewBox="0 0 24 24"><path fill="currentColor" d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/></svg>',
  ribbon: '<svg class="ic" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a7 7 0 0 1 4.5 12.4L18 22l-6-3-6 3 1.5-7.600A7 7 0 0 1 12 2z"/></svg>',
  coin: '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="2"/></svg>',
};
function setScreen(cls, html) { screen.className = cls; screen.innerHTML = html; delete screen.dataset.vote; }
function safeFor(kind) {
  const portraitMode = innerHeight > innerWidth;
  stage.setSafe(kind === 'arena' ? { top: 0.13, bottom: isTouch() ? (portraitMode ? 0.3 : 0.06) : 0.09, left: 0.03, right: 0.03 }
    : kind === 'board' ? { top: 0.14, bottom: 0.2, left: 0.03, right: 0.03 }
    : kind === 'editor' ? (portraitMode ? { top: 0.07, bottom: 0.6, left: 0.06, right: 0.06 } : { top: 0.08, bottom: 0.06, left: 0.04, right: Math.min(0.62, 470 / innerWidth + 0.04) })
    : kind === 'lobby' ? (portraitMode ? { top: 0.1, bottom: 0.62, left: 0.04, right: 0.04 } : { top: 0.16, bottom: 0.12, left: 0.04, right: 0.5 })
    : { top: 0.1, bottom: 0.5, left: 0.04, right: 0.04 });
}
addEventListener('resize', () => safeFor(S.modal?.editor ? 'editor' : S.safeKind || 'title'));
const setSafe = kind => { S.safeKind = kind; safeFor(S.modal?.editor ? 'editor' : kind); };   // the look editor keeps its framing while the lobby redraws

// ------------------------------------------------------------------ title
function showTitle() {
  S.phase = null; hud.innerHTML = ''; setSafe('title');
  lineup.show(true);
  if (S.me) lineup.sync([{ pid: 0, seat: 0, name: S.me.name, look: S.me.look, costume: S.me.costume }], { labels: false });
  const code = cleanCode(q.get('code') || '') || '';
  // someone new who opened an invite link: make a character first, then one tap joins (2026-10-20)
  // (S.inviting keeps this screen up after a name or look change marks the character as made)
  const invite = code && S.me && !S.asDisplay && (S.inviting || !S.me.ready);
  if (invite) {
    S.inviting = true;
    setScreen('title', `
    <img class="logo" src="${ART}logo.webp" alt="Tumblefair" onerror="this.replaceWith(Object.assign(document.createElement('h1'),{className:'logo-text',textContent:'TUMBLEFAIR'}))">
    <div class="panel title-panel invite">
      <h2>You're invited!</h2>
      <p class="note">Pick a name and a look for your character, then join room <b>${esc(code)}</b>.</p>
      <label class="field"><span>Your name</span><input id="name" maxlength="14" autocomplete="off" autocapitalize="words" spellcheck="false" value="${esc(S.me?.name || '')}"></label>
      <button class="btn" data-act="edit">Change look</button>
      <input type="hidden" id="code" value="${code}"><input type="checkbox" id="as-display" hidden ${S.asDisplay ? 'checked' : ''}>
      <button class="btn big primary" data-act="join">Join the game</button>
      <button class="btn small ghost" data-act="home">Back to the main menu</button>
      <p class="err">${esc(S.err)}</p>
    </div>
    <p class="foot">2–4 players · everyone plays on their own phone · <span class="net">${net.status === 'online' ? '' : 'connecting…'}</span></p>`);
    return;
  }
  setScreen('title', `
    <img class="logo" src="${ART}logo.webp" alt="Tumblefair" onerror="this.replaceWith(Object.assign(document.createElement('h1'),{className:'logo-text',textContent:'TUMBLEFAIR'}))">
    <div class="panel title-panel">
      <label class="field"><span>Your name</span><input id="name" maxlength="14" autocomplete="off" autocapitalize="words" spellcheck="false" value="${esc(S.me?.name || '')}"></label>
      <div class="row"><button class="btn" data-act="edit">Change look</button><button class="btn" data-act="shop">Costumes <span class="coins">${ICON.coin}${S.me?.coins ?? 0}</span></button></div>
      <button class="btn big primary" data-act="host">Host a game</button>
      <button class="btn big" data-act="find">Find a game</button>
      <div class="join-row"><input id="code" maxlength="${CODE_LENGTH}" placeholder="CODE" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${code}"><button class="btn big" data-act="join">Join</button></div>
      <input type="checkbox" id="as-display" hidden ${S.asDisplay ? 'checked' : ''}>
      <button class="btn small ghost watch-btn" data-act="watch">👀 Just watch a game (TV or sitting out)</button>
      <p class="err">${esc(S.err)}</p>
    </div>
    <p class="foot">2–4 players · everyone joins on their own phone · <span class="net">${net.status === 'online' ? '' : 'connecting…'}</span></p>
    <p class="foot privacy">No cookies, no ads. We count plays anonymously to make the fair better.</p>`);
}
function saveName() { const n = $('#name')?.value.trim(); if (n && n !== S.me?.name) net.send({ t: 'profile', name: n }); }

// ------------------------------------------------------------------ lobby
async function showLobby() {
  setSafe('lobby'); hud.innerHTML = '';
  lineup.show(true); lineup.setPoses({});
  lineup.sync(seated(), { me: S.room.you });
  const r = S.room, host = isHost(), me = mine(), n = seated().length;
  const modes = { board: ['Board Game', 'Roll dice round the board, buy ribbons, play a minigame every round.'], marathon: ['Minigame Marathon', 'No board. Vote, play, repeat. Most points wins.'], endless: ['The Fair Never Closes', 'Keep playing, harder and harder. Every 3 games you vote to go on or finish.'] };
  setScreen('lobby', `
    <div class="panel lobby-code${S.codeSmall ? ' small' : ''}">
      <div class="qr" id="qr"></div>
      <div class="code-txt"><span class="lbl">Join at <b>${esc(location.host)}</b> with code</span><div class="code">${r.code}</div><button class="btn small" data-act="copy">Copy invite link</button> <button class="btn small" data-act="bigqr" title="Show the QR code full screen">Big QR</button></div>
      <button class="code-fold" data-act="fold" aria-label="${S.codeSmall ? 'Show the QR code' : 'Make this smaller'}">${S.codeSmall ? 'QR ▾' : '▴'}</button>
    </div>
    <div class="panel lobby-main">
      <h2>Players <small>${n} of 4</small></h2>
      <div class="members">${members().filter(m => !m.display).map(m => chipOf(m, `${m.pid === r.host ? '<em class="tagh">host</em>' : ''}${m.wait ? '<em class="tagh">waiting</em>' : ''}${host && m.pid !== r.you ? `<button class="x" data-act="kick" data-pid="${m.pid}" title="Remove">×</button>` : ''}`)).join('')}
        ${members().some(m => m.display) ? `<span class="chip tv">Big screen connected</span>` : ''}</div>
      ${me?.display ? '<p class="note">This screen is watching. Players join on their phones.</p>' : `<div class="row"><button class="btn" data-act="edit">Change look</button><button class="btn" data-act="shop">Costumes <span class="coins">${ICON.coin}${S.me?.coins ?? 0}</span></button></div>`}
      <h2>Game</h2>
      <div class="modes">${Object.entries(modes).map(([id, [t, d]]) => `<button class="mode${r.opts.mode === id ? ' on' : ''}" data-act="opt" data-key="mode" data-value="${id}" ${host ? '' : 'disabled'}><b>${t}</b><span>${d}</span></button>`).join('')}</div>
      <p class="mode-desc">${esc(modes[r.opts.mode]?.[1] || '')}</p>
      ${r.opts.mode === 'board' ? `<div class="row opts"><span>Board</span>${Object.values(BOARDS).map(b => `<button class="pill${r.opts.board === b.id ? ' on' : ''}" data-act="opt" data-key="board" data-value="${b.id}" ${host ? '' : 'disabled'}>${esc(b.title)}</button>`).join('')}</div>
        <div class="row opts"><span>Moving</span>${[['dice', 'Roll a die'], ['cards', 'Move cards']].map(([v, t]) => `<button class="pill${(r.opts.moves || 'dice') === v ? ' on' : ''}" data-act="opt" data-key="moves" data-value="${v}" ${host ? '' : 'disabled'}>${t}</button>`).join('')}
        <span class="est">${r.opts.moves === 'cards' ? 'Hold 4 cards, play one, or take a mystery card from a rival' : 'Tap to roll 1 to 6'}</span></div>` : ''}
      ${r.opts.mode === 'endless' ? '' : `<div class="row opts"><span>Rounds</span>${[3, 4, 5, 6].map(v => `<button class="pill${r.opts.rounds === v ? ' on' : ''}" data-act="opt" data-key="rounds" data-num="${v}" ${host ? '' : 'disabled'}>${v}</button>`).join('')}
        <span class="est">about ${Math.round(r.opts.rounds * (r.opts.mode === 'board' ? 2.6 : 1.6))} min</span></div>`}
      <div class="row opts"><span>Play as</span><button class="pill${!r.opts.teams ? ' on' : ''}" data-act="opt" data-key="teams" data-bool="0" ${host ? '' : 'disabled'}>Everyone for themselves</button><button class="pill${r.opts.teams ? ' on' : ''}" data-act="opt" data-key="teams" data-bool="1" ${host ? '' : 'disabled'}>Teams</button>
        ${r.opts.teams ? `<span class="est">${n === 3 ? 'Teams need 2 or 4 players' : 'Red &amp; Green vs Blue &amp; Pink'}</span>` : ''}</div>
      <div class="row opts"><span>Who can join</span><button class="pill${!r.opts.public ? ' on' : ''}" data-act="opt" data-key="public" data-bool="0" ${host ? '' : 'disabled'}>Invite only</button><button class="pill${r.opts.public ? ' on' : ''}" data-act="opt" data-key="public" data-bool="1" ${host ? '' : 'disabled'}>Public</button>
        <span class="est">${r.opts.public ? 'Listed in Find a game' : 'Only people with the code'}</span></div>
      <div class="row opts"><span>Difficulty</span>${[['easy', 'Family'], ['normal', 'Normal'], ['hard', 'Tricky']].map(([v, t]) => `<button class="pill${r.opts.difficulty === v ? ' on' : ''}" data-act="opt" data-key="difficulty" data-value="${v}" ${host ? '' : 'disabled'}>${t}</button>`).join('')}</div>
      <div class="row opts"><span>Holidays</span>${[['auto', `Auto${r.dateSeason ? ` (${seasonName(r.dateSeason)})` : ''}`], ...SEASONS.map(x => [x.id, x.name]), ['only', 'Holiday games only'], ['off', 'Off']].map(([v, t]) => `<button class="pill${(r.opts.holiday || 'auto') === v ? ' on' : ''}" data-act="opt" data-key="holiday" data-value="${v}" ${host ? '' : 'disabled'}>${esc(t)}</button>`).join('')}</div>
      <div class="row opts"><span>Minigames</span><button class="pill on" data-act="pool">${r.opts.pool?.length ? `${r.opts.pool.length} picked` : `All ${Object.values(GAMES).filter(g => inSeason(g.meta, r.season)).length}`}</button>${host ? '<span class="est">tap to choose</span>' : ''}</div>
      <div class="lobby-go${host ? '' : ' guest'}">${host ? `<button class="btn big primary" data-act="start">${n < 2 ? 'Start (solo practice)' : 'Start the game'}</button>` : `<p class="note">${me?.wait ? 'The seats are full. You will join when one frees up.' : 'Waiting for the host to start…'}</p>`}
      ${me?.display ? '<button class="btn small" data-act="swap" data-to="play">Play instead</button>' : host ? '' : '<button class="btn small" data-act="swap" data-to="watch">Just watch instead</button>'}
      <button class="btn small ghost" data-act="leave">Leave</button></div>
    </div>`);
  qrSvg(joinUrl(r.code)).then(svg => { const e = $('#qr'); if (e) e.innerHTML = svg; }).catch(() => {});
}

// ------------------------------------------------------------------ match HUD (scores along the top)
function drawHud() {
  const r = S.room; if (!r?.match || S.phase === 'game' || S.phase === 'intro' || S.phase === 'lobby') { hud.innerHTML = ''; return; }
  const board = r.match.mode === 'board';
  const teams = S.teams ? `<span class="teams">${S.teams.map(t => `<b class="team t${t.team}">${esc(t.name)}: ${board ? `${t.ribbons} ribbons` : `${t.points} pts`}</b>`).join('')}</span>` : '';
  hud.innerHTML = `<div class="match-bar"><span class="round">Round ${r.match.round}${r.match.rounds ? '/' + r.match.rounds : ''}</span>${teams}${seated().map(m => chipOf(m, board
    ? `<em class="sc tk">${ICON.ticket}${S.bd.tickets[m.pid] ?? 0}</em><em class="sc rb">${ICON.ribbon}${S.bd.ribbons[m.pid] ?? 0}</em>` : `<em class="sc">${r.match.points[m.pid] ?? 0} pts</em>`)).join('')}</div>`;
  if (board && S.bd.pid != null) hud.querySelector(`[data-pid="${S.bd.pid}"]`)?.classList.add('turn');
}

// ------------------------------------------------------------------ board
async function ensureBoard() {
  const id = BOARDS[S.room?.match?.boardId] ? S.room.match.boardId : 'fairground';
  if (S.board && S.board.id !== id) dropBoard();
  if (!S.board && !S.boardP) S.boardP = createBoardView({ stage, season: S.room?.season || null, def: BOARDS[id], members, me: S.room.you, assetBase: ART }).then(b => { b.id = id; S.board = b; S.boardP = null; if (S.room?.match?.board) b.sync(S.room.match.board); return b; });
  return S.board || S.boardP;
}
function dropBoard() { S.board?.dispose(); S.board = null; }
function showBoard() {
  setSafe('board'); lineup.show(false);
  const b = S.bd, turn = members().find(m => m.pid === b.pid), my = b.pid === S.room.you;
  let body = '';
  if (b.ask && my && b.ask.kind === 'duck') body = `<div class="panel ask duck-ask"><h3>Duck Pond: pick a duck!</h3><div class="row ducks">${b.ask.options.map((o, i) => `<button class="btn big duck d${i}" data-act="choose" data-i="${i}" aria-label="${esc(o)}">${DUCK}<span>${esc(o.split(' ')[0])}</span></button>`).join('')}</div></div>`;
  else if (b.ask && my) body = `<div class="panel ask"><h3>${b.ask.kind === 'booth' ? 'Prize Booth' : 'Crossroads'}</h3><div class="row">${b.ask.options.map((o, i) => `<button class="btn big${i === 0 ? ' primary' : ''}" data-act="choose" data-i="${i}">${esc(o)}</button>`).join('')}</div></div>`;
  else if (b.ask) body = `<div class="banner">${esc(turn?.name || '')} ${b.ask.kind === 'duck' ? 'is picking a duck…' : 'is deciding…'}</div>`;
  else if (b.sub === 'roll' && my && S.bd.hands) { const hand = S.bd.hands[S.room.you] || []; body = `<div class="panel ask hand"><h3>Play a move card</h3><div class="row cards">${hand.map((n, i) => `<button class="mcard" data-act="card" data-i="${i}" aria-label="Move ${n}"><b>${n}</b><small>${n === 1 ? 'space' : 'spaces'}</small></button>`).join('')}<button class="mcard mystery" data-act="card" data-i="-1" aria-label="A mystery card from a rival"><b>?</b><small>a rival's</small></button></div></div>`; }
  else if (b.sub === 'roll' && my) body = `<button class="btn huge primary roll" data-act="roll">ROLL!</button>`;
  else if (b.sub === 'roll') body = `<div class="banner">${esc(turn?.name || '')}'s turn</div>`;
  const dice = b.dice ? `<div class="dice2">${b.dice.map(n => `<div class="die ${b.boost === 'gold' ? 'gold' : 'sticky'}">${n}</div>`).join('')}</div>` : b.rolled ? `<div class="die" data-n="${b.rolled}">${b.rolled}</div>` : '';
  const duel = b.duel ? `<div class="dice2 duel">${b.duel.dice.map((n, i) => `<div class="die${b.duel.winner === b.duel.pids[i] ? ' won' : ''}"><small>${esc(b.duel.names[i])}</small>${n}</div>`).join('<b class="vs">VS</b>')}</div>` : '';
  const bull = b.bulletin ? `<div class="bulletin"><small>FAIR BULLETIN · Round ${b.bulletin.round}</small><h2>${esc(b.bulletin.title)}</h2><p>${esc(b.bulletin.text)}</p></div>` : '';
  const mod = b.mods ? `<button class="mods" data-act="bulletin" title="What this round's bulletin does">${esc(b.mods)} <i>ⓘ</i></button>` : '';
  setScreen('board', `${bull}${mod}${dice}${duel}${b.text ? `<div class="banner fx">${esc(b.text)}</div>` : ''}<div class="board-foot">${body}</div>`);
  drawHud();
}
function onBoard(ev) {
  const b = S.bd;
  S.board?.event(ev);
  if (ev.ev === 'bulletin') {
    b.bulletin = { title: ev.title, text: ev.text, round: ev.round }; b.mods = ev.id === 'quiet' ? '' : ev.title.replace(/!$/, ''); b.modsInfo = b.bulletin;
    Object.assign(b.tickets, ev.tickets || {}); Object.assign(b.ribbons, ev.ribbons || {}); b.text = ''; sfx('open');
    setTimeout(() => { if (S.bd.bulletin?.title === ev.title) { S.bd.bulletin = null; if (S.phase === 'board') showBoard(); } }, 4000);
  }
  if (ev.ev === 'turn') { b.bulletin = null; b.duel = null; b.dice = null; b.boost = null; }
  if (ev.hands) b.hands = ev.hands;
  if (ev.ev === 'turn') { b.pid = ev.pid; b.sub = 'roll'; b.ask = null; b.rolled = null; b.text = ''; if (ev.pid === S.room?.you) { sfx('turn'); navigator.vibrate?.(60); } }
  if (ev.ev === 'rolled') { b.sub = 'move'; b.rolled = ev.n; b.dice = ev.dice || null; b.boost = ev.boost || null; sfx('dice');
    if (ev.card != null) { const nm = p => members().find(m => m.pid === p)?.name || ''; b.text = ev.from != null ? `${nm(ev.pid)} draws a mystery card from ${nm(ev.from)}: ${ev.card}!` : `${nm(ev.pid)} plays a ${ev.card}`; } }
  if (ev.ev === 'step') { b.tickets[ev.pid] = ev.tickets; setTimeout(() => { S.bd.rolled = null; S.bd.dice = null; if (S.phase === 'board') showBoard(); }, 600); if (ev.lap) toast(`${members().find(m => m.pid === ev.pid)?.name || ''} passes the gate: +5 tickets`); }
  if (ev.ev === 'ask') { b.ask = { kind: ev.kind, options: ev.options }; b.sub = 'ask'; }
  if (ev.ev === 'chose') { b.ask = null; b.sub = 'move'; }
  if (ev.ev === 'fx') {
    if (ev.tickets && typeof ev.tickets === 'object') Object.assign(b.tickets, ev.tickets); else if (ev.tickets != null) b.tickets[ev.pid] = ev.tickets;
    if (ev.ribbons && typeof ev.ribbons === 'object') Object.assign(b.ribbons, ev.ribbons); else if (ev.ribbons != null) b.ribbons[ev.pid] = ev.ribbons;
    b.text = ev.text || ''; b.sub = 'fx';
    b.duel = ev.kind === 'duel' && ev.dice ? { dice: ev.dice, pids: [ev.pid, ev.with], winner: ev.winner, names: [ev.pid, ev.with].map(p => members().find(m => m.pid === p)?.name || '') } : null;
    if (ev.text) sfx(ev.kind === 'ribbon' ? 'win' : (ev.d ?? 0) < 0 || ev.kind === 'pit' ? 'bad' : 'good');
  }
  if (S.phase === 'board') showBoard();
}

// ------------------------------------------------------------------ vote / intro / results / final
function card(id, extra = '') { const m = GAMES[id].meta; return `<span class="gcard"><img src="${ART}${m.card}.webp" alt="" onerror="this.style.visibility='hidden'"><b>${esc(m.title)}</b><span>${esc(m.blurb)}</span>${extra}</span>`; }
const voteDots = i => Object.entries(S.votes).filter(([, v]) => v === i).map(([pid]) => { const m = members().find(x => x.pid === +pid); return m ? `<i class="dot" style="background:${seatOf(m)?.color}"></i>` : ''; }).join('');
function showVote() {
  setSafe('title'); const pm = S.pm, me = mine(), can = me?.seat != null;
  // a vote arriving only changes the highlight and the dots, in place: rebuilding the screen reloaded every picture
  // and reset the scroll, so the cards jumped about each time anyone tapped (owner, 2026-10-22)
  const cards = screen.classList.contains('vote') && screen.querySelectorAll('.vote-card');
  if (cards && cards.length === pm.options.length && screen.dataset.vote === pm.options.join()) {
    cards.forEach((c, i) => { c.classList.toggle('mine', S.votes[S.room.you] === i); c.classList.toggle('won', S.voted === i); const w = c.querySelector('.who'); if (w) w.innerHTML = voteDots(i); });
    return;
  }
  setScreen('vote', `<h1 class="shout">Vote for the next game!</h1>
    <div class="vote-cards">${pm.options.map((id, i) => `<button class="vote-card${S.votes[S.room.you] === i ? ' mine' : ''}${S.voted === i ? ' won' : ''}" data-act="vote" data-i="${i}" ${can ? '' : 'disabled'}>${card(id, `<u class="who">${voteDots(i)}</u>`)}</button>`).join('')}</div>
    <p class="note">${can ? 'Tap a card.' : 'Watching.'} <b class="count">${left()}</b></p>
    ${S.lastGame && !S.rated[S.lastGame] ? rateBox(S.lastGame, true) : ''}`);
  screen.dataset.vote = pm.options.join();
  drawHud();
}
function showContinue() {
  setSafe('title'); const me = mine(), can = me?.seat != null, mineV = S.votes[S.room.you];
  const count = i => Object.values(S.votes).filter(v => v === i).length;
  setScreen('vote', `<h1 class="shout">Keep the fair open?</h1>
    <div class="panel continue-card"><p class="blurb">${S.room.match.round} games played. The next ones are ${S.room.match.round >= 6 ? 'hard' : 'trickier'}.</p>
      <div class="row">${['Keep playing!', 'Finish now'].map((t, i) => `<button class="btn big${i === 0 ? ' primary' : ''}${mineV === i ? ' mine' : ''}" data-act="vote" data-i="${i}" ${can ? '' : 'disabled'}>${t} <small>(${count(i)})</small></button>`).join('')}</div>
      <p class="note">A tie keeps it open. <b class="count">${left()}</b></p></div>`);
  drawHud();
}
function showIntro() {
  const pm = S.pm, m = GAMES[pm.game].meta, me = mine(), can = me?.seat != null && pm.players.some(p => p.pid === me.pid);
  const ctl = m.kind === 'arena' ? (isTouch() ? `Left thumb: move.${m.controls?.a ? ` Big button: ${m.controls.a}.` : ''}${m.controls?.b ? ` Small button: ${m.controls.b}.` : ''}` : `WASD or arrows: move.${m.controls?.a ? ` Space: ${m.controls.a}.` : ''}${m.controls?.b ? ` E: ${m.controls.b}.` : ''}`) : 'Tap your choices on this screen.';
  setScreen('intro', `<div class="panel intro-card"><img src="${ART}${m.card}.webp" alt="" onerror="this.remove()">
    ${pm.season === 'halloween' && !m.season ? '<p class="season-ribbon halloween">Halloween edition</p>' : ''}<h1 class="shout">${esc(m.title)}</h1><p class="blurb">${esc(m.blurb)}</p>
    <ul>${m.how.map(l => `<li>${btnText(esc(l), m.controls, { html: true })}</li>`).join('')}</ul><p class="ctl">${esc(ctl)}</p>${pm.difficulty && S.room.match?.mode === 'endless' ? `<p class="note">Difficulty: <b>${esc(pm.difficulty)}</b></p>` : ''}
    ${can ? `<button class="btn big primary" data-act="skip">${S.skips.includes(me.pid) ? 'Ready ✓' : "I'm ready"}</button>` : '<p class="note">Watching this one.</p>'}
    <p class="note">Starts in <b class="count">${left()}</b> · ${S.skips.length}/${pm.players.length} ready</p></div>`);
  hud.innerHTML = '';
}
function showResults() {
  const pm = S.pm, m = GAMES[pm.game].meta, me = mine();
  let place = 0; const rows = [];
  for (const g of pm.result.order) { for (const pid of g) { const mem = members().find(x => x.pid === pid); if (mem) rows.push(`<li class="p${place + 1}"><span class="pl">${pm.result.coop ? '' : ['1st', '2nd', '3rd', '4th'][place]}</span>${chipOf(mem)}<span class="score">${pm.result.scores?.[pid] ?? ''} ${esc(pm.result.scores?.[pid] === 1 ? String(pm.result.unit || '').replace(/s$/, '') : pm.result.unit || '')}</span><span class="award">+${pm.award[pid] ?? 0} ${pm.unit === 'tickets' ? ICON.ticket : ''}${pm.unit}</span></li>`); } place += g.length; }
  setScreen('results', `<div class="panel results-card"><h1 class="shout">${esc(m.title)}</h1>
    ${pm.result.coop ? `<p class="blurb">${pm.result.coop.success ? 'You did it together!' : 'So close. Better luck next time!'}</p>` : ''}
    ${pm.mul > 1 ? `<p class="blurb double">Double Prize Day: tickets x${pm.mul}!</p>` : ''}
    <ol class="places">${rows.join('')}</ol>
    ${pm.teams ? `<p class="team-line">${pm.teams.map(t => `<b class="team t${t.team}">${esc(t.name)} ${pm.unit === 'tickets' ? t.tickets + ' tickets' : t.points + ' pts'}</b>`).join(' ')}</p>` : ''}
    ${rateBox(pm.game)}
    ${me?.seat != null ? `<button class="btn big primary" data-act="skip">${S.skips.includes(me.pid) ? 'Ready ✓' : 'Continue'}</button>` : ''}<p class="note">Next in <b class="count">${left()}</b></p></div>`);
  drawHud();
}
// ------------------------------------------------------------------ rating a minigame (round 7, owner 2026-10-22)
// "Players rate minigames after playing them … we can use that data later to weed out the unfun ones or prioritise the
// good ones." 👍 / 👎, then any of a few reasons, then "Tell us more" (the ! form, already about this game). It shows on
// the results card, and again on the next vote screen if it was skipped. Only someone who PLAYED it is asked.
const playedIt = id => { const me = mine(); return !!me && me.seat != null && (S.playedIds || []).includes(id); };
function rateBox(id, small = false) {
  if (!id || !GAMES[id] || !playedIt(id)) return '';
  const r = S.rated[id], title = esc(GAMES[id].meta.title);
  if (!r) return `<div class="rate${small ? ' small' : ''}" data-game="${id}"><span class="q">${small ? `How was <b>${title}</b>?` : 'Did you like this one?'}</span>
    <button class="btn thumb up" data-act="rate" data-v="1" aria-label="I liked it">👍</button><button class="btn thumb down" data-act="rate" data-v="-1" aria-label="Not for me">👎</button></div>`;
  const list = r.v > 0 ? RATE_REASONS.up : RATE_REASONS.down;
  return `<div class="rate done${small ? ' small' : ''}" data-game="${id}"><span class="q">${r.v > 0 ? '👍 Thanks! What was good?' : '👎 Thanks! What was wrong?'}</span>
    <div class="why">${list.map(([k, t]) => `<button class="pill${r.why.includes(k) ? ' on' : ''}" data-act="reason" data-k="${k}">${esc(t)}</button>`).join('')}</div>
    <div class="row"><button class="btn small ghost" data-act="rechoose">${r.v > 0 ? 'Change to 👎' : 'Change to 👍'}</button><button class="btn small" data-act="tellmore">Tell us more</button></div></div>`;
}
let rateTimer = 0;
function sendRate(id) { clearTimeout(rateTimer); rateTimer = setTimeout(() => { const r = S.rated[id]; if (r) net.send({ t: 'rate', game: id, v: r.v, why: r.why.join(',') }); }, 500); }
function redrawRate(id) { for (const el of document.querySelectorAll(`.rate[data-game="${id}"]`)) { const small = el.classList.contains('small'); el.outerHTML = rateBox(id, small) || ''; } }
/** The closing ceremony (board mode): two bonus ribbons, revealed one at a time. */
function showBonus() {
  const pm = S.pm; setSafe('lobby'); dropBoard(); lineup.show(true);
  const order = seated();
  lineup.sync(order, { me: S.room.you });
  const me = mine();
  const rows = pm.awards.map((a, i) => `<li class="award-row" style="animation-delay:${1.2 + i * 3}s"><span class="ribbon-badge">${ICON.ribbon}</span><span><b>${esc(a.title)}</b><small>${esc(a.text)} (${a.value})</small></span><span class="who">${a.pids.map(p => { const m = members().find(x => x.pid === p); return m ? chipOf(m) : ''; }).join('')}</span></li>`).join('');
  setScreen('final', `<div class="panel final-card bonus-card"><h1 class="shout">Bonus Ribbons!</h1><p class="note">The fair is closing. The judges have two more ribbons to hand out…</p><ol class="awards">${rows}</ol>
    ${me?.seat != null ? `<button class="btn big primary" data-act="skip">${S.skips.includes(me.pid) ? 'Ready ✓' : 'Continue'}</button>` : ''}<p class="note">Results in <b class="count">${left()}</b></p></div>`);
  pm.awards.forEach((a, i) => setTimeout(() => { if (S.phase !== 'bonus') return; sfx('win'); lineup.setPoses?.(Object.fromEntries(seated().map(m => [m.pid, a.pids.includes(m.pid) ? 'cheer' : 'clap']))); }, 1200 + i * 3000));
  hud.innerHTML = '';
}
function showFinal() {
  const pm = S.pm, me = mine(); setSafe('lobby'); dropBoard();
  lineup.show(true);
  const order = pm.standings.map(r => members().find(m => m.pid === r.pid)).filter(Boolean);
  lineup.sync(order, { me: S.room.you }).then(() => lineup.setPoses(Object.fromEntries(pm.standings.map(r => [r.pid, r.place === 1 ? 'cheer' : r.place === pm.standings.length && pm.standings.length > 2 ? 'sitGround' : 'clap']))));
  const win = pm.standings.filter(r => r.place === 1).map(r => members().find(m => m.pid === r.pid)?.name).filter(Boolean);
  const teamWin = pm.teams && pm.teams.filter(t => t.place === 1);
  const head = teamWin ? (teamWin.length > 1 ? "It's a draw!" : `Team ${teamWin[0].name} wins!`) : pm.standings.length > 1 ? `${win.join(' & ')} win${win.length > 1 ? '' : 's'}!` : 'Nice run!';
  setScreen('final', `<div class="panel final-card"><h1 class="shout">${esc(head)}</h1>
    ${pm.teams ? `<p class="team-line">${pm.teams.map(t => `<b class="team t${t.team}">${esc(t.name)} ${pm.mode === 'board' ? `${t.ribbons} ribbons · ${t.tickets} tickets` : `${t.points} pts`}</b>`).join(' ')}</p>` : ''}
    <ol class="places">${pm.standings.map(r => { const mem = members().find(m => m.pid === r.pid); return mem ? `<li class="p${r.place}"><span class="pl">${['1st', '2nd', '3rd', '4th'][r.place - 1]}</span>${chipOf(mem)}<span class="score">${pm.mode === 'board' ? `${ICON.ribbon}${r.ribbons} ${ICON.ticket}${r.tickets}` : `${r.points} pts`}</span><span class="award">+${pm.payout[r.pid] ?? 0} ${ICON.coin}coins</span></li>` : ''; }).join('')}</ol>
    <p class="note">Coins buy costumes. They never help you win.</p>
    ${me?.seat != null ? `<button class="btn big primary" data-act="skip">${S.skips.includes(me.pid) ? 'Ready ✓' : 'Back to the lobby'}</button>` : ''}<p class="note">Lobby in <b class="count">${left()}</b></p></div>`);
  hud.innerHTML = ''; sfx('win');
}

// ------------------------------------------------------------------ phases
function dropPlay() { const p = S.play; S.play = null; S.playP = null; p?.dispose(); $('#game-ui').innerHTML = ''; controls.set(null); }
async function onPhase(pm) {
  const prev = S.phase;
  S.log = [...(S.log || []).slice(-30), `${Math.round(performance.now())} ${pm.phase}${pm.game ? ' ' + pm.game : ''}${pm.resume ? ' resume' : ''}`];   // recent phases, for tests and bug reports
  S.pm = pm; S.phase = pm.phase; S.ends = performance.now() + (pm.ms || 0); S.skips = [];
  document.body.dataset.phase = pm.phase;
  // round 7: which minigames THIS player played here (only they are asked to rate one), and the latest of them
  if (pm.phase === 'intro' && pm.game && pm.players?.some(p => p.pid === S.room?.you)) { S.playedIds = [...new Set([...(S.playedIds || []), pm.game])]; S.lastGame = pm.game; }
  if (pm.phase === 'results' && pm.game && !pm.resume) tally('minigame_done', { game: pm.game });
  if (pm.phase !== 'game' && pm.phase !== 'results' && pm.phase !== 'intro') dropPlay();
  switch (pm.phase) {
    case 'lobby': S.teams = null; dropBoard(); S.bd = { tickets: {}, ribbons: {}, pid: null, ask: null, rolled: null }; showLobby(); break;
    case 'board': await ensureBoard(); if (S.phase !== 'board') return; S.board.show?.(); showBoard(); break;
    case 'continue': S.votes = pm.votes || {}; lineup.show(false); showContinue(); sfx('open'); break;
    case 'vote': S.votes = pm.votes || {}; S.voted = null; lineup.show(false); if (S.room.match.mode === 'board') await ensureBoard(); showVote(); sfx('open'); break;
    case 'intro': {
      dropPlay(); dropBoard(); lineup.show(false); setSafe(GAMES[pm.game].meta.kind === 'arena' ? 'arena' : 'title');
      S.playP = createPlay({ stage, net, controls, intro: pm, members, me: mine()?.seat != null ? S.room.you : null, uiRoot: $('#game-ui'), sfx });
      const mine2 = S.playP;
      if (!pm.resume) showIntro();
      const play = await mine2;
      if (S.playP !== mine2) { play.dispose(); return; }
      S.play = play;
      if (S.phase === 'game') { setScreen('playing', ''); play.start(); }
      break;
    }
    case 'game': setScreen('playing', ''); hud.innerHTML = ''; if (S.play) S.play.start(); sfx('go'); break;
    case 'results': controls.set(null); S.teams = pm.teams || null; showResults(); sfx('open'); break;
    case 'bonus': showBonus(); break;
    case 'final': showFinal(); break;
  }
  if (prev !== pm.phase) drawHud();
}

// ------------------------------------------------------------------ network
net.on('status', s => { document.body.dataset.net = s; const e = $('.foot .net'); if (e) e.textContent = s === 'online' ? '' : 'connecting…'; });
// an invite link (?code=ABCD) joins at once — unless this phone has never made a character: then showTitle() asks for a
// name and a look first, and its Join button joins (a big screen, ?display=1, never needs a character)
const onWelcome = m => { S.me = m; if (!S.room) { showTitle(); const code = cleanCode(q.get('code') || ''); if (code && !S.tried && (m.ready || S.asDisplay)) { S.tried = true; net.join(code, S.asDisplay); } } };
net.on('welcome', onWelcome);
if (net.me) onWelcome(net.me);                      // the hello was answered while the page was still loading its data
net.on('me', () => { S.me = net.me; if (!S.room) showTitle(); else if (S.phase === 'lobby') showLobby(); S.modal?.refresh?.(); });
net.on('wallet', () => { S.me = net.me; });
net.on('room', r => {
  setSeason(r.season ?? r.dateSeason ?? null);
  // a host's last minigame list comes back with them (round 5)
  if (r.phase === 'lobby' && r.host === r.you && S.poolFor !== r.code) { S.poolFor = r.code; try { const v = JSON.parse(localStorage.getItem('tumblefair.pool') || '[]').filter(id => GAMES[id]); if (v.length && !r.opts.pool?.length) net.send({ t: 'opt', key: 'pool', value: v }); } catch {} }
  const first = !S.room; S.room = r;
  if (r.match?.board) { Object.assign(S.bd.tickets, r.match.board.tickets); Object.assign(S.bd.ribbons, r.match.board.ribbons); S.bd.pid = r.match.board.pid; S.bd.mods = r.match.board.bulletin && r.match.board.bulletin.id !== 'quiet' ? r.match.board.bulletin.title.replace(/!$/, '') : ''; if (r.match.board.bulletin) S.bd.modsInfo = { title: r.match.board.bulletin.title, text: r.match.board.bulletin.text, round: r.match.board.bulletin.round ?? r.match.round }; S.bd.sub = S.bd.sub || r.match.board.sub; if (r.match.board.hands) S.bd.hands = r.match.board.hands; if (r.match.board.ask && !S.bd.ask) S.bd.ask = r.match.board.ask; S.board?.sync(r.match.board); }
  if (first) { history.replaceState(null, '', `?code=${r.code}${S.asDisplay ? '&display=1' : ''}`); if (r.phase === 'lobby') onPhase({ phase: 'lobby' }); }
  else if (r.phase === 'lobby' && S.phase === 'lobby') showLobby();
  else drawHud();
});
net.on('phase', onPhase);
net.on('left', () => {
  S.room = null; S.inviting = false; dropPlay(); dropBoard(); history.replaceState(null, '', location.pathname); q.delete('code');
  const sw = S.swapTo; S.swapTo = null;
  if (sw) { S.asDisplay = sw.watch; net.join(sw.code, sw.watch); return; }       // "Just watch instead" / "Play instead": rejoin the same room the other way
  showTitle();
});
net.on('kicked', () => { S.room = null; dropPlay(); dropBoard(); S.err = 'The host removed you from the room.'; showTitle(); });
net.on('err', m => { if (!S.room) { S.err = m.msg; showTitle(); } else toast(m.msg, 'bad'); });
net.on('bd', onBoard);
net.on('votes', m => { S.votes = m.votes; if (S.phase === 'vote') showVote(); else if (S.phase === 'continue') showContinue(); });
net.on('voted', m => { S.voted = m.pick; if (S.phase === 'vote') showVote(); sfx('good'); });
net.on('skips', m => { S.skips = m.pids; if (S.phase === 'intro') showIntro(); else if (S.phase === 'results') showResults(); });
net.on('s', m => S.play?.snap(m));
net.on('ge', m => S.play?.event(m));
net.on('gp', m => { if (S.play) S.play.priv(m.d); else S.playP?.then(p => p.priv(m.d)); });
net.on('emote', m => lineup.play(m.pid, m.e, 1500));
net.on('rated', m => { if (!S.rated[m.game]) S.rated[m.game] = { v: m.v, why: m.why || [] }; });
net.on('rooms', m => { S.pub = m.list || []; S.modal?.drawFind?.(); });

// ------------------------------------------------------------------ taps
screen.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  sfx.unlock(); sfx('tap');
  const act = b.dataset.act;
  switch (act) {
    case 'host': saveName(); S.err = ''; S.asDisplay = false; net.create(); tally('host_game', { device: deviceKind() }); break;
    case 'join': { saveName(); if (S.me && !S.me.ready) { net.send({ t: 'profile', name: $('#name')?.value.trim() || S.me.name }); S.me.ready = true; } const code = cleanCode($('#code').value); if (!code) { S.err = `The code is ${CODE_LENGTH} letters.`; showTitle(); break; } S.err = ''; S.asDisplay = $('#as-display').checked; net.join(code, S.asDisplay); tally('join_game', { via: S.inviting ? 'invite' : 'code', display: S.asDisplay }); break; }
    case 'leave': net.leave(); break;
    case 'watch': saveName(); openWatch(); break;
    case 'home': S.inviting = false; S.err = ''; q.delete('code'); history.replaceState(null, '', location.pathname); showTitle(); break;
    case 'swap': {
      const watch = b.dataset.to === 'watch';
      if (watch && !b.classList.contains('sure')) { b.classList.add('sure'); b.textContent = 'Tap again: you will watch, not play'; break; }
      S.swapTo = { code: S.room.code, watch }; net.leave(); tally('swap_seat', { to: watch ? 'watch' : 'play' }); break;
    }
    case 'bulletin': { const i = S.bd.modsInfo; if (i) { S.bd.bulletin = i; showBoard(); setTimeout(() => { if (S.bd.bulletin === i) { S.bd.bulletin = null; if (S.phase === 'board') showBoard(); } }, 5000); } break; }
    case 'fold': S.codeSmall = !S.codeSmall; try { localStorage.setItem('tumblefair.codeSmall', S.codeSmall ? '1' : ''); } catch { /* private mode */ } showLobby(); break;
    case 'bigqr': showBigQr(); break;
    case 'copy': navigator.clipboard?.writeText(joinUrl(S.room.code)).then(() => toast('Invite link copied'), () => toast(joinUrl(S.room.code))) ?? toast(joinUrl(S.room.code)); break;
    case 'opt': net.send({ t: 'opt', key: b.dataset.key, value: b.dataset.num ? +b.dataset.num : b.dataset.bool ? b.dataset.bool === '1' : b.dataset.value }); if (b.dataset.key === 'public' && b.dataset.bool === '1') tally('make_public'); break;
    case 'start': net.send({ t: 'start' }); tally('start_match', { mode: S.room?.opts.mode, players: seated().length, public: !!S.room?.opts.public }); break;
    case 'kick': net.send({ t: 'kick', pid: +b.dataset.pid }); break;
    case 'roll': net.send({ t: 'roll' }); S.bd.sub = 'move'; showBoard(); break;
    case 'card': net.send({ t: 'card', i: +b.dataset.i }); S.bd.sub = 'move'; showBoard(); break;
    case 'choose': net.send({ t: 'choose', i: +b.dataset.i }); S.bd.ask = null; showBoard(); break;
    case 'vote': net.send({ t: 'vote', i: +b.dataset.i }); break;
    case 'skip': net.send({ t: 'skip' }); break;
    case 'edit': saveName(); openEditor(); tally('open_editor'); break;
    case 'shop': saveName(); openShop(); tally('open_shop'); break;
    case 'pool': openPool(); break;
    case 'find': saveName(); openFind(); break;
    case 'rate': case 'rechoose': {
      const id = b.closest('.rate')?.dataset.game; if (!id) break;
      const v = act === 'rate' ? +b.dataset.v : -(S.rated[id]?.v || 1);
      S.rated[id] = { v, why: [] }; sendRate(id); redrawRate(id); tally('rate', { game: id, v: v > 0 ? 'up' : 'down' }); sfx('good'); break;
    }
    case 'reason': {
      const id = b.closest('.rate')?.dataset.game, r = id && S.rated[id]; if (!r) break;
      const k = b.dataset.k; r.why = r.why.includes(k) ? r.why.filter(x => x !== k) : [...r.why, k].slice(-4);
      sendRate(id); redrawRate(id); break;
    }
    case 'tellmore': {
      const id = b.closest('.rate')?.dataset.game; if (!id) break;
      const r = S.rated[id], title = GAMES[id]?.meta.title || id;
      fb.open({ kind: 'idea', text: `About ${title}${r ? ` (${r.v > 0 ? '👍' : '👎'}${r.why.length ? ' ' + r.why.join(', ') : ''})` : ''}: `, about: { game: id, rating: r || null }, noPicture: true });
      tally('rate_more', { game: id }); break;
    }
  }
});
screen.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'code') $('[data-act="join"]')?.click(); if (e.key === 'Enter' && e.target.id === 'name') e.target.blur(); });
screen.addEventListener('change', e => { if (e.target.id === 'name') saveName(); });
addEventListener('pointerdown', () => sfx.unlock(), { once: true });

// ------------------------------------------------------------------ look editor and costume shop (modals)
function closeModal() { const wasEditor = S.modal?.editor; S.modal?.onClose?.(); S.modal?.el.remove(); S.modal = null; if (wasEditor) { document.body.classList.remove('editing'); lineup.focus(null); safeFor(S.safeKind || 'title'); } }
function openEditor() {
  closeModal();
  const ed = createEditor({ look: S.me.look, races: RACES, raceNames: RACE_NAMES, onChange: look => net.send({ t: 'profile', look }), onClose: closeModal });
  document.body.append(ed.el); S.modal = ed; ed.editor = true;
  document.body.classList.add('editing'); lineup.focus(S.room ? S.room.you : 0); safeFor('editor');
}
/** The costume shop (round 6): a side panel like the look editor, with your character framed beside it. Tap any costume
 *  to TRY IT ON (only on this screen: nobody else sees it), then Wear it if you own it or Buy it if you can afford it.
 *  Browsing the expensive ones is the point (owner 2026-10-22: "so I can at least browse the future options"). */
function openShop() {
  closeModal();
  const el = h('div', 'modal side shop');
  let sel = S.me.costume;
  const me = () => (S.room ? S.room.you : 0);
  const preview = id => lineup.preview(me(), id === S.me.costume ? null : id);
  const draw = () => {
    const c = costumes().find(x => x.id === sel) || costumes()[0], own = S.me.owned.includes(c.id), on = S.me.costume === c.id;
    const act = on ? '<button class="btn big" disabled>Wearing it</button>'
      : own ? `<button class="btn big primary" data-wear="1">Wear ${esc(c.name)}</button>`
      : S.me.coins >= c.price ? `<button class="btn big primary" data-buy="1">Buy for ${ICON.coin}${c.price}</button>`
      : `<button class="btn big" disabled>${ICON.coin}${c.price - S.me.coins} more coins needed</button>`;
    el.innerHTML = `<div class="panel sheet">
      <div class="row head"><h2>Costumes <span class="coins">${ICON.coin}${S.me.coins}</span></h2><button class="btn small primary" data-close="1">Done</button></div>
      <div class="shop-sel"><b>${esc(c.name)}</b><span>${on ? 'You are wearing this.' : own ? 'Yours. Tap Wear to put it on.' : `Trying it on. Costs ${c.price} coins.`}</span>${act}</div>
      <p class="note">Tap any costume to try it on. Costumes are only for show; win coins by finishing matches.</p>
      <div class="costumes">${costumes().filter(x => inSeason(x, seasonByDate())).sort((a, b) => !!b.season - !!a.season).map(x => { const o = S.me.owned.includes(x.id), w = S.me.costume === x.id; return `<button class="costume${w ? ' on' : ''}${o ? ' own' : ''}${x.id === sel ? ' sel' : ''}" data-id="${x.id}" ${!o && S.me.coins < x.price ? 'data-poor="1"' : ''}><img src="${portrait({ look: S.me.look, costume: x.id })}" alt="">${x.tag ? `<i class="tag t-${esc(x.tag.toLowerCase())}">${esc(x.tag)}</i>` : ''}<b>${esc(x.name)}</b><span>${w ? 'Wearing' : o ? 'Owned' : `${ICON.coin}${x.price}`}</span></button>`; }).join('')}</div>
      </div>`;
  };
  el.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) return closeModal();
    const c = costumes().find(x => x.id === sel);
    if (e.target.closest('[data-wear]')) { net.send({ t: 'equip', id: c.id }); sfx('good'); return; }
    if (e.target.closest('[data-buy]')) { if (confirm(`Buy ${c.name} for ${c.price} coins?`)) { net.send({ t: 'buy', id: c.id }); net.send({ t: 'equip', id: c.id }); sfx('coins'); tally('buy_costume', { id: c.id }); } return; }
    const b = e.target.closest('.costume'); if (!b) return;
    sel = b.dataset.id; preview(sel); sfx('tap');
    const y = el.scrollTop; draw(); el.scrollTop = y;
  });
  draw(); document.body.append(el);
  S.modal = { el, refresh: () => { const y = el.scrollTop; draw(); el.scrollTop = y; preview(sel); }, editor: true, onClose: () => lineup.preview(me(), null) };
  document.body.classList.add('editing'); lineup.focus(me()); safeFor('editor');
}

/** The host picks which minigames can come up (round 5). Nothing ticked = every game. Remembered on this phone. */
const TAG_NAMES = { holiday: 'Holidays', action: 'Action', puzzle: 'Puzzle', social: 'Talk & vote', chance: 'Luck', coop: 'Team up' };
function openPool() {
  closeModal();
  const host = isHost(), el = h('div', 'modal pool');
  let pick = new Set(S.room.opts.pool?.length ? S.room.opts.pool : Object.keys(GAMES));
  const send = () => { const all = pick.size === Object.keys(GAMES).length; const v = all ? [] : [...pick]; net.send({ t: 'opt', key: 'pool', value: v }); try { localStorage.setItem('tumblefair.pool', JSON.stringify(v)); } catch {} };
  const draw = () => {
    const groups = { holiday: [] };
    for (const [id, g] of Object.entries(GAMES)) { const t = g.meta.season ? 'holiday' : g.meta.tags?.[0] || 'action'; (groups[t] ||= []).push([id, g.meta]); }
    if (!groups.holiday.length) delete groups.holiday;
    const season = S.room.season;
    el.innerHTML = `<div class="panel"><h2>Minigames <small>${pick.size} of ${Object.keys(GAMES).length}</small></h2>
      <p class="note">${host ? 'Untick the games you do not want tonight. The vote only offers ticked games that fit the number of players.' : 'Only the host can change this.'}</p>
      ${host ? `<div class="row"><button class="btn small" data-all="1">All</button><button class="btn small" data-all="0">None</button>${Object.entries(TAG_NAMES).map(([t, n]) => `<button class="btn small" data-tag="${t}">Only ${n}</button>`).join('')}</div>` : ''}
      ${Object.entries(groups).map(([t, list]) => `<h3>${esc(TAG_NAMES[t] || t)}</h3>${t === 'holiday' ? `<p class="note">${season ? `On now: ${esc(seasonName(season))}.` : 'Off right now.'} Holiday games only come up while their holiday is on: by the date (Auto), or set Holidays in the lobby to switch one on any time.</p>` : ''}<div class="pool-grid">${list.sort((a, b) => a[1].title.localeCompare(b[1].title)).map(([id, m]) => `<button class="pool-g${pick.has(id) ? ' on' : ''}${m.season && m.season !== season ? ' asleep' : ''}" data-id="${id}" ${host ? '' : 'disabled'}><img src="${ART}${m.card}.webp" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><b>${esc(m.title)}</b><small>${m.season && m.season !== season ? `${esc(seasonName(m.season))} only` : `${m.min === m.max ? m.min : `${m.min}–${m.max}`} players`}</small><i class="tick">${pick.has(id) ? '✓' : ''}</i></button>`).join('')}</div>`).join('')}
      <button class="btn big primary" data-close="1">Done</button></div>`;
  };
  el.addEventListener('click', e => {
    if (e.target.closest('[data-close]') || e.target === el) { if (host && !pick.size) { toast('Pick at least one game (or tap All).', 'bad'); return; } return closeModal(); }
    if (!host) return;
    const a = e.target.closest('[data-all]'), t = e.target.closest('[data-tag]'), g = e.target.closest('.pool-g');
    if (a) pick = new Set(a.dataset.all === '1' ? Object.keys(GAMES) : []);
    else if (t) pick = new Set(Object.keys(GAMES).filter(id => GAMES[id].meta.tags?.includes(t.dataset.tag)));
    else if (g) { if (pick.has(g.dataset.id)) pick.delete(g.dataset.id); else pick.add(g.dataset.id); }
    else return;
    if (pick.size) send();
    const y = el.scrollTop; draw(); el.scrollTop = y;
  });
  draw(); document.body.append(el); S.modal = { el, refresh: () => {} };
}

// ------------------------------------------------------------------ Find a game (round 7, owner 2026-10-22)
// "A public lobby system to help people find games." A host flips the lobby to Public; this list shows every public
// room — lobbies with a free seat first — and one tap joins. It asks the server again every three seconds while open.
function openFind() {
  closeModal();
  const el = h('div', 'modal find');
  let poll = 0;
  const modeName = { board: 'Board Game', marathon: 'Minigame Marathon', endless: 'Endless' };
  function draw() {
    const list = S.pub;
    el.innerHTML = `<div class="panel"><div class="row head"><h2>Find a game</h2><span class="grow"></span><button class="btn small" data-x="1">Close</button></div>
      ${list == null ? '<p class="note">Looking…</p>' : !list.length ? `<p class="note">No public games right now. Host one and set it to <b>Public</b> — it shows up here for everyone.</p>` : `<ul class="pub-list">${list.map(r => {
        const full = r.players >= r.seats, playing = r.phase !== 'lobby';
        return `<li><span class="who"><b>${esc(r.host)}'s game</b><span>${esc(modeName[r.mode] || r.mode)}${playing ? ` · playing${r.rounds ? `, round ${r.round} of ${r.rounds}` : ''}` : ''}</span></span>
          <span class="seats">${r.players}/${r.seats}</span>
          <button class="btn${!full && !playing ? ' primary' : ''}" data-pub="${esc(r.code)}">${full ? 'Watch' : playing ? 'Join next game' : 'Join'}</button></li>`; }).join('')}</ul>`}
      <p class="note small">Games you join here can see your name and character.</p></div>`;
  }
  el.addEventListener('click', e => {
    if (e.target === el || e.target.closest('[data-x]')) { closeModal(); return; }
    const j = e.target.closest('[data-pub]'); if (!j) return;
    const code = cleanCode(j.dataset.pub); if (!code) return;
    if (S.me && !S.me.ready) { net.send({ t: 'profile', name: $('#name')?.value.trim() || S.me.name }); S.me.ready = true; }
    S.err = ''; S.asDisplay = false; closeModal(); net.join(code, false); tally('join_game', { via: 'public' });
  });
  draw(); document.body.append(el);
  S.pub = null; net.send({ t: 'rooms' }); poll = setInterval(() => net.send({ t: 'rooms' }), 3000);
  S.modal = { el, refresh: () => {}, drawFind: draw, onClose: () => clearInterval(poll) };
  tally('find_game');
}

// ------------------------------------------------------------------ Just watch (owner 2026-10-22)
// "Instead of 'this is a big screen' … just people choose to be spectators, with a popup to confirm explaining they can't
// participate." The same thing as the old big-screen join (a TV is simply someone watching), asked as a choice.
function openWatch() {
  closeModal();
  const code = cleanCode($('#code')?.value || q.get('code') || '');
  const el = h('div', 'modal watch');
  el.innerHTML = `<div class="panel"><h2>Just watch?</h2>
    <p>You'll see the board and every minigame, but <b>you won't play</b> in this game. Good for a TV everyone can see, or for sitting one out.</p>
    <p class="note">Want to play after all? Tap <b>Play instead</b> in the lobby. Late joiners who play get a seat at the next minigame.</p>
    <label class="field"><span>Room code</span><input id="watch-code" maxlength="${CODE_LENGTH}" placeholder="CODE" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(code)}"></label>
    <p class="err" id="watch-err"></p>
    <div class="row"><button class="btn" data-x="1">Cancel</button><button class="btn big primary" id="watch-go">Watch</button></div></div>`;
  el.addEventListener('click', e => {
    if (e.target === el || e.target.closest('[data-x]')) { closeModal(); return; }
    if (!e.target.closest('#watch-go')) return;
    const c = cleanCode(el.querySelector('#watch-code').value);
    if (!c) { el.querySelector('#watch-err').textContent = `The code is ${CODE_LENGTH} letters.`; return; }
    S.err = ''; S.asDisplay = true; closeModal(); net.join(c, true); tally('join_game', { via: 'code', display: true });
  });
  document.body.append(el); S.modal = { el, refresh: () => {} };
  if (!code) el.querySelector('#watch-code').focus();
}

// ------------------------------------------------------------------ the menu button (2026-10-22, a player's report)
// "There needs to be a reliable menu button to get back to the main menu, including this screen [a minigame] and the
// invite QR screen." One ☰ next to the ! on every screen except the title (which IS the main menu).
const menuBtn = h('button', 'menu-btn', '☰'); menuBtn.type = 'button'; menuBtn.title = 'Menu'; menuBtn.setAttribute('aria-label', 'Menu'); menuBtn.hidden = true;
menuBtn.onclick = () => openMenu(); document.body.append(menuBtn);
function openMenu() {
  closeBigQr(); closeModal();
  const inRoom = !!S.room, playing = inRoom && S.phase && S.phase !== 'lobby';
  const el = h('div', 'modal menu-sheet');
  el.innerHTML = `<div class="panel"><h2>Menu</h2>
    <button class="btn big primary" data-m="close">Back to ${playing ? 'the game' : inRoom ? 'the lobby' : 'the fair'}</button>
    ${inRoom ? '<button class="btn big" data-m="qr">Invite people (QR code)</button>' : ''}
    <button class="btn big" data-m="fb">Report a bug or idea</button>
    <button class="btn big danger" data-m="home">${inRoom ? 'Leave to the main menu' : 'Main menu'}</button></div>`;
  el.addEventListener('click', e => {
    if (e.target === el) { closeModal(); return; }
    const m = e.target.closest('[data-m]')?.dataset.m; if (!m) return;
    sfx('tap');
    if (m === 'close') closeModal();
    else if (m === 'qr') { closeModal(); showBigQr(); }
    else if (m === 'fb') { closeModal(); fb.open({ kind: 'idea' }); }
    else if (m === 'home') {
      const b = e.target.closest('[data-m]');
      if (inRoom && playing && !b.classList.contains('sure')) { b.classList.add('sure'); b.textContent = 'Tap again to leave this game'; return; }
      closeModal(); tally('menu_leave', { phase: S.phase || 'title' });
      if (inRoom) net.leave(); else { S.inviting = false; q.delete('code'); history.replaceState(null, '', location.pathname); showTitle(); }
    }
  });
  document.body.append(el); S.modal = { el, refresh: () => {} };
}
function drawMenuBtn() { menuBtn.hidden = !(S.room || S.inviting); }

// ------------------------------------------------------------------ the big QR code (owner 2026-10-22)
// "Add a QR code button to join from. Useful with a TV and several people on phones." A full-screen code anyone in the
// room can read from the sofa — in the lobby, and mid-match too (a late joiner watches, then gets a seat at the next
// minigame). The corner button shows on the big screen and on a computer the whole time (a phone uses the lobby's own Big QR button).
const qrBtn = h('button', 'qr-btn', 'QR'); qrBtn.type = 'button'; qrBtn.title = 'Show a QR code to join this game'; qrBtn.hidden = true;
qrBtn.onclick = () => showBigQr(); document.body.append(qrBtn);
let bigQr = null;
function showBigQr() {
  if (!S.room?.code) return;
  bigQr?.remove();
  const code = S.room.code, el = h('div', 'qr-big', `<div class="qr-card"><div class="qr-pic"></div><p class="qr-say">Scan to join</p>
    <p class="qr-code">${esc(code)}</p><p class="qr-at">or open <b>${esc(location.host)}</b> and type the code</p><button class="btn big qr-x" type="button">Close</button></div>`);
  el.addEventListener('click', () => closeBigQr());
  document.body.append(el); bigQr = el;
  qrSvg(joinUrl(code)).then(svg => { const e = el.querySelector('.qr-pic'); if (e) e.innerHTML = svg; }).catch(() => { const e = el.querySelector('.qr-pic'); if (e) e.textContent = 'The QR code could not be drawn — use the code below.'; });
}
function closeBigQr() { bigQr?.remove(); bigQr = null; }
addEventListener('keydown', e => { if (e.key === 'Escape' && bigQr) closeBigQr(); });
// a controller walks every menu (report #14): A presses, B closes the top sheet; an arena minigame keeps the pad to itself
createPadNav({ busy: () => !!controls.shown, back: () => {
  if (bigQr) return closeBigQr();
  const top = [...document.querySelectorAll('.modal')].pop();
  const x = top?.querySelector('[data-close], [data-x], [data-m="close"], .fb-cancel, .x-close');
  if (x) return x.click();
  if (top && S.modal?.el === top) return closeModal();
} });
function drawQrBtn() {
  const inRoom = !!S.room?.code && net.status === 'online';
  qrBtn.hidden = !(inRoom && (mine()?.display || !isTouch()));      // a phone's lobby has its own Big QR button (round 8: the corner holds ☰ and ! now)
  if (!S.room && bigQr) closeBigQr();
}
window.tumblefairQr = { show: () => showBigQr(), close: () => closeBigQr(), get open() { return !!bigQr; }, get button() { return !qrBtn.hidden; } };      // specs

// ------------------------------------------------------------------ the frame loop
let lastT = performance.now(), lastCount = -1, netAt = 0, qrAt = 0;
// The connection readout (round 4): the round trip to the server and how uneven it is, in the corner during a match,
// so "it lags" can be told apart from "this phone's line is bad". Green under 80 ms, amber under 160, red above.
const netq = h('div', 'netq'); document.body.append(netq);
function drawNet(t) {
  if (t - netAt < 1000) return; netAt = t;
  const on = !!S.room && S.phase && S.phase !== 'lobby' && net.status === 'online';
  netq.hidden = !on; if (!on) return;
  const j = S.play?.net?.().jitter ?? 0, ms = net.ping + Math.round(j), q = ms < 80 ? 'good' : ms < 160 ? 'ok' : 'bad';
  netq.className = 'netq ' + q; netq.textContent = `${net.ping} ms${j > 25 ? ` ±${Math.round(j)}` : ''}`;
  netq.title = 'Round trip to the server (± how uneven it is)';
}
function frame(t) {
  const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
  lineup.frame(dt); S.board?.frame(dt); S.play?.frame(dt);
  stage.render(dt);
  drawNet(t);
  if (t - qrAt > 500) { qrAt = t; drawQrBtn(); drawMenuBtn(); }
  const c = left(); if (c !== lastCount) { lastCount = c; for (const e of document.querySelectorAll('.count')) e.textContent = c; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
$('#boot').remove();
// iOS ignores user-scalable=no: stop pinch and double-tap zoom ourselves (same as Thousandvale's phone layout)
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, e => e.preventDefault());
let lastTouch = 0; document.addEventListener('touchend', e => { const n = Date.now(); if (n - lastTouch < 320 && !e.target.closest('input, textarea')) e.preventDefault(); lastTouch = n; }, { passive: false });
