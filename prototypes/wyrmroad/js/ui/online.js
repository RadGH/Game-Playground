// Online co-op screens (game-standards §2), one job each:
//   Online co-op  — your hero, Host a room (Public / Invite only), Join with a code, Find a game (public rooms)
//   Room          — invite (QR, Big QR, copy link), four seats with 3D portraits, the host's chapter, ready / start,
//                   host tools (remove, make host), vote to remove for everyone else
//   Story scene   — the chapter's opening / closing scene on every device; skip waits for everyone (60 s at most);
//                   the last chapter's choice is the host's
//   Lost          — the host picks: again from the last fight, or back to the room
//   Results       — everyone's share, then back to the room
// The chapter itself runs on the room server; js/net/session.js is the session the play screen runs, exactly like a
// local one. ?code=ABCD in the address joins at once. Full API: docs/ONLINE.md.
//
//   openOnline(ctx)   ctx = { root, data, T, hero, save, onStart(session, meta), onBack(), dialog, sfx, renderPortrait }
//                     (also accepts the page's { app, play, back } — js/main.js)
import { ask as sharedAsk } from '../../../../shared/dialog.js';
import { tip } from '../../../../shared/tooltip.js';
import { hp as whole } from '../../../../shared/format.js';
import { Net } from '../net/client.js';
import { MAX_SEATS, cleanCode, CODE_LENGTH } from '../net/protocol.js';
import { createNetSession } from '../net/session.js';
import { dressedLook } from '../sim/items.js';
import { applyChoice, progressOf } from '../sim/route.js';
import { chapterCleared } from '../save.js';
import { qrSvg } from '../../../tumblefair/js/client/qr.js';
import { icon } from './icons.js';
import { esc, CLASS_NAMES, timeText, placeShort } from './text.js';
import { openSheet, note } from './kit.js';

const END_PAUSE_MS = { won: 1900, lost: 1300 };   // the last blow is seen, then the scene / results take over (before the play screen's own local end screens)
const CPS = 70;                     // letters a second as a story line appears
const joinUrl = code => `${location.origin}${location.pathname}?code=${code}`;

let O = null;                       // the one online state of this page (a second openOnline shows where you are)

/** Open the online screens. Returns { leave } (also reachable as the session's leave() while playing). */
export function openOnline(ctx = {}) {
  ensureCss();
  if (O) { O.ctx = norm(ctx); O.show(true); return O.api; }
  O = createOnline(norm(ctx));
  O.show(true);
  const code = cleanCode(new URLSearchParams(location.search).get('code'));
  if (code) O.join(code);
  return O.api;
}
/** What the online part is doing (window.gameEye and tests). */
export function onlineState() {
  if (!O) return null;
  return { screen: O.screen, connection: O.net?.state || 'closed', rtt: O.net?.rtt ?? null, code: O.room?.code || null, phase: O.room?.phase || null,
    you: O.room?.you || null, host: O.room?.host || null, seats: O.room?.seats.map(s => ({ name: s.name, cls: s.hero?.cls || null, ready: s.ready, away: s.away, host: s.host })) || [],
    session: O.session ? O.session.netStats : null };
}

function ensureCss() {
  if (document.querySelector('link[data-wo-css]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.woCss = '1';
  l.href = new URL('../../css/online.css', import.meta.url).href;
  document.head.append(l);
}

/** Accept both the documented ctx and the page's { app, play, back }. */
function norm(ctx) {
  const app = ctx.app || null;
  return {
    app, root: ctx.root || app?.ui || document.getElementById('ui') || document.body,
    data: ctx.data || app?.data, T: ctx.T || app?.T, save: ctx.save || app?.save || null,
    hero: ctx.hero || null,
    onStart: ctx.onStart || ctx.play || (() => {}),
    onBack: ctx.onBack || ctx.back || (() => app?.go?.('title')),
    ask: ctx.dialog?.ask || sharedAsk,
    sfx: name => { try { (ctx.sfx || app?.audio?.play)?.(name); } catch { /* a missing sound is not worth a crash */ } },
    portrait: (spec, size) => (ctx.renderPortrait ? Promise.resolve(ctx.renderPortrait(spec, { size })) : app?.portrait ? app.portrait(spec, size) : Promise.resolve(null)).catch(() => null),
    onResult: ctx.onResult || null,
    saveNow: ctx.saveNow || (app ? () => app.saveNow?.() : () => {}),
    device: () => app?.input?.last || 'keyboard',
    onDevice: f => app?.input?.onDevice?.(f) || (() => {}),
  };
}

function createOnline(ctx0) {
  const S = {
    ctx: ctx0, net: null, room: null, list: null, session: null, start: null, screen: null, pub: false, qr: { code: null, svg: '' },
    hero: ctx0.hero || ctx0.save?.heroes?.[0] || null, overAt: 0, deferred: null, scene: null, line: 0, shownChars: 0, lineAt: 0,
    result: null, listTimer: 0, pingTimer: 0, offs: [], wantRoom: false, pending: null, busy: false, sceneTimer: 0,
  };
  const C = () => S.ctx;
  const click = () => C().sfx('ui.click');
  const chapters = () => C().data.chapters.chapters;
  const chapterOf = id => chapters().find(c => c.id === id) || null;
  const atOf = h => { const p = progressOf(C().data, h.story || {}); return p.route[p.reached]; };   // where a hero stands on their own road
  const heroes = () => C().save?.heroes || [];
  const kb = kind => { const d = C().device(); if (d === 'touch') return ''; return kind === 'ok' ? (d === 'pad' ? 'A' : 'Enter') : kind === 'back' ? (d === 'pad' ? 'B' : 'Esc') : kind === 'next' ? (d === 'pad' ? 'A' : 'Space') : ''; };
  const kbd = kind => { const k = kb(kind); return k ? `<kbd>${esc(k)}</kbd>` : ''; };
  const me = () => S.room?.seats.find(s => s.pid === S.room.you) || null;
  const isHost = () => !!S.room && S.room.host === S.room.you;

  // ---------------------------------------------------------------- the connection
  async function net() {
    if (S.net?.state === 'open') return S.net;
    if (!S.net) {
      const n = S.net = new Net();
      S.offs.push(
        n.on('room', m => onRoom(m)),
        n.on('rooms', m => { S.list = m.list; if (S.screen === 'entry') drawList(); }),
        n.on('err', m => { S.busy = false; if (m.code === 'noroom' || m.code === 'full' || m.code === 'kicked') { S.wantRoom = false; if (S.screen !== 'entry') entry(); } entryNote(m.msg); if (S.screen !== 'entry') note(m.msg); }),
        n.on('scene', m => later(() => onScene(m))),
        n.on('start', m => onStart(m)),
        n.on('over', m => onOver(m)),
        n.on('result', m => { S.result = m.result; applyResult(m.result); }),
        n.on('ended', m => { endPlay(); note(m.why); later(() => show(true)); }),
        n.on('kicked', m => bye(m.msg || 'You were removed from the room.')),
        n.on('closed', m => bye(m.why === 'restart' ? 'The online server restarted, so the room closed. Host a new one in a moment.' : m.why === 'admin' ? 'The room was closed.' : 'The room closed.')),
        n.on('state', () => drawDot()),
        n.on('open', () => { if (S.hero && S.room) sendMe(); drawDot(); }),
      );
      S.pingTimer = setInterval(() => { n.ping(); setTimeout(drawDot, 400); }, 3000);
    }
    await S.net.connect();
    return S.net;
  }
  function hangUp() {
    clearInterval(S.pingTimer); clearInterval(S.listTimer);
    for (const off of S.offs) off(); S.offs = [];
    S.net?.close(); S.net = null; S.room = null; S.list = null; S.start = null; S.result = null;
  }
  function bye(text) {
    endPlay(); hangUp();
    S.screen = null;
    note(text);
    entry();
  }
  /** Leave the room and the online screens altogether. */
  function leaveAll() { endPlay(); hangUp(); S.screen = null; O = null; C().onBack(); }

  /** The hero you bring, as the server checks it (js/net/protocol.js cleanHero). */
  function heroSummary(h) {
    const D = C().data, Cl = D.classes.classes[h.cls];
    const spells = (h.spells || []).filter(s => s && Cl.spells.includes(s) && D.classes.spells[s].level <= h.level);
    return { name: h.name, cls: h.cls, level: h.level, xp: h.xp, gear: h.gear, spells: spells.length ? spells : Cl.spells.slice(0, 1),
      look: dressedLook(D.classes, D.items, { cls: h.cls, look: h.look, gear: h.gear }), story: { reached: h.story?.reached || 0, choices: h.story?.choices || {} } };
  }
  function sendMe() { if (S.hero) S.net?.send({ t: 'me', hero: heroSummary(S.hero) }); }
  function lookSpec(h) { const D = C().data; return h ? { look: dressedLook(D.classes, D.items, { cls: h.cls, look: h.look, gear: h.gear }) } : null; }

  // ---------------------------------------------------------------- messages that move the screens
  function onRoom(m) {
    const first = !S.room;
    S.room = m;
    if (first && S.hero) sendMe();
    if (S.session && !S.session.closed && m.phase === 'play') return;          // the play screen shows the team
    if (S.deferred) return;                                                     // the end of a chapter is still on screen
    if (S.wantRoom || first) { S.wantRoom = false; S.busy = false; }
    show();
  }
  function onScene(m) { S.scene = { id: m.id, kind: m.kind }; S.line = 0; S.shownChars = 0; S.lineAt = performance.now(); }   // the room update right after it moves the screen
  async function onStart(m) {
    // back after a dropped line, same chapter still running: the session carries on (a full picture comes first)
    if (S.session && !S.session.closed && S.start && S.start.chapter === m.chapter && S.start.seed === m.seed) { S.start = m; S.net.send({ t: 'loaded' }); return; }
    S.start = m; S.result = null; S.deferred = null; S.overAt = 0;
    const { data, T } = C();
    const session = await createNetSession({ net: S.net, data, T, start: m });
    session.chapter = m.chapter; session.section = m.section; session.code = m.code;
    session.onLeave = () => leaveAll();          // the play screen's ☰ menu asks first
    session.isHost = () => isHost();               // a pre-boss scene: the host reads it for the room (play.js)
    session.release = () => S.net?.send({ t: 'release' });
    S.session = session;
    if (C().save && S.hero?.id) C().save.lastHero = S.hero.id;            // the play screen saves loot to the hero you brought
    takeScreen('play');
    try { await C().app?.view?.setChapter?.(m.chapter); } catch { /* the play screen sets it again */ }
    const meta = { online: true, heroId: S.hero?.id || null, chapter: m.chapter, section: m.section, code: m.code, you: m.you, dropIn: !!m.dropIn, roster: m.roster, retry: m.section > 0 };
    await C().onStart(session, meta);
    S.net?.send({ t: 'loaded' });
  }
  function onOver(m) { S.overAt = performance.now(); S.endWait = END_PAUSE_MS[m.outcome] || 1500; S.deferred = []; setTimeout(flushLater, S.endWait + 30); }
  /** Something that changes the screen while the end of a chapter is still showing waits for it. */
  function later(fn) { if (S.deferred) S.deferred.push(fn); else fn(); }
  function flushLater() {
    if (!S.deferred || performance.now() - S.overAt < S.endWait) return;
    const q = S.deferred; S.deferred = null;
    endPlay();
    for (const fn of q) fn();
    show(true);
  }
  function endPlay() { if (S.session) { S.session.close(); S.session.serverClosed = true; S.session = null; } }

  /** A won chapter moves your hero's story on (xp, gold and loot came through the session's events during play). */
  function applyResult(res) {
    const h = S.hero, mine = res.players.find(p => p.pid === S.room?.you);
    if (C().onResult) { try { C().onResult(res, mine); } catch (e) { console.error(e); } return; }
    if (!h || res.outcome !== 'won') return;
    // the room walked the host's road: your hero's save follows it (chapterCleared puts you on that road), and a
    // choice made at the end of this chapter is the host's choice for everyone (the results screen says so)
    chapterCleared(C().data, h, res.chapter, res.time);
    if (res.choice) { applyChoice(h.story, res.choice.key, res.choice.pick); h.story.reached = progressOf(C().data, h.story).reached; }
    if (res.finale) { h.story.finale = res.finale; if (!h.story.endings.includes(res.finale)) h.story.endings.push(res.finale); }
    C().saveNow();
    sendMe();
  }

  // ---------------------------------------------------------------- the screen
  /** Take #ui for an online screen (the page's own screens step aside the way app.go does it). */
  function takeScreen(name) {
    const app = C().app;
    if (name !== 'scene') dropStage();
    if (name === 'play') { S.screen = 'play'; return; }
    if (app && app.screen !== 'online') {
      app.closeAllSheets?.();
      try { app.cleanup?.(); } catch (e) { console.error(e); }
      app.cleanup = null; app.loop = null; app.padBusy = false; app.showcase?.(null); app.viewBox?.(null);
      app.screen = 'online'; app.screenOpts = {}; document.documentElement.dataset.screen = 'online';
      app.cleanup = () => { if (S.screen !== 'play') S.screen = null; offKeys(); dropStage(); };
    }
    onKeys();
    S.screen = name;
  }
  function backdrop(chapterId) {
    const app = C().app; if (!app) return;
    const id = chapterId || 'millbrook';
    if (S.backdrop === id && app.screen === 'online') return;
    S.backdrop = id;
    app.sceneG?.(id); app.view?.setChapter?.(id); app.view?.scenic?.(true);
  }
  let keysOn = false;
  const onKey = e => {
    if (C().app && C().app.screen !== 'online') return;
    if (document.querySelector('.modal, .wr-sheet') || e.target?.matches?.('input, textarea')) { if (e.key === 'Enter' && e.target?.matches?.('.wo-code-in')) return; if (!e.target?.matches?.('input, textarea')) return; }
    const root = C().root;
    if (e.key === 'Escape') { const b = root.querySelector('[data-back]'); if (b) { e.preventDefault(); b.click(); } }
    else if (e.key === 'Enter' && !e.target?.matches?.('button')) { const b = root.querySelector('[data-primary]:not([disabled])'); if (b) { e.preventDefault(); b.click(); } }
    else if (e.key === ' ' && S.screen === 'scene') { e.preventDefault(); nextLine(); }
  };
  function onKeys() { if (!keysOn) { addEventListener('keydown', onKey); keysOn = true; } }
  function offKeys() { removeEventListener('keydown', onKey); keysOn = false; clearInterval(S.sceneTimer); }

  /** Pick the screen the room's phase asks for. force: draw even when it is the same screen. */
  function show(force = false) {
    if (S.session && !S.session.closed) return;
    const r = S.room;
    const want = !r ? 'entry' : r.phase === 'intro' || r.phase === 'outro' ? 'scene' : r.phase === 'lost' ? 'lost' : r.phase === 'results' ? 'results' : 'room';
    if (want === 'entry') { if (force || S.screen !== 'entry') entry(); return; }
    if (want === 'scene') { if (!S.scene || S.scene.id !== r.scene?.id) { S.scene = { id: r.scene.id, kind: r.scene.kind }; S.line = 0; S.lineAt = performance.now(); } if (force || S.screen !== 'scene') sceneScreen(); else drawSceneWait(); return; }
    if (want === 'lost') { if (force || S.screen !== 'lost') lostScreen(); else drawLost(); return; }
    if (want === 'results') { if (force || S.screen !== 'results') resultsScreen(); else drawResults(); return; }
    if (force || S.screen !== 'room') roomScreen(); else drawRoom();
  }

  const head = (title, { backLabel = 'Back', code = '' } = {}) => `<header class="wo-bar">
      <button type="button" class="wr-btn wr-small wo-back" data-back>${icon('back')}<span>${esc(backLabel)}</span>${kbd('back')}</button>
      <h1${code ? ' class="wo-h-code"' : ''}>${code ? `<small>${esc(title)}</small> <b class="wo-code">${esc(code)}</b>` : esc(title)}</h1>
      <span class="wo-dot" role="status" aria-label="Connection"><i></i><span class="wo-dot-text"></span></span>
    </header>`;
  function drawDot() {
    const d = C().root.querySelector('.wo-dot'); if (!d) return;
    const st = S.net?.state || 'closed', rtt = S.net?.rtt;
    d.dataset.state = st === 'open' ? (rtt != null && rtt > 250 ? 'slow' : 'open') : st;
    d.querySelector('.wo-dot-text').textContent = st === 'open' ? (rtt != null ? `${whole(rtt)} ms` : 'Online') : st === 'connecting' ? 'Connecting' : 'Offline';
    tip(d, st === 'open' ? `Connected to the online server${rtt != null ? ` · ${whole(rtt)} ms there and back` : ''}` : st === 'connecting' ? 'Reaching the online server…' : 'Not connected. Solo and same-screen co-op still work.');
  }

  // ---------------------------------------------------------------- Online co-op (entry)
  function heroCard(h, { change = true } = {}) {
    if (!h) return `<div class="wo-hero wo-hero-none"><div class="wo-face wo-face-big"><span class="wo-initial">?</span></div><div class="wo-hero-who"><b>No hero yet</b><span>Make one to play online.</span></div><button type="button" class="wr-btn wr-primary" data-act="create" data-primary>${icon('plus')}<span>Make a hero</span>${kbd('ok')}</button></div>`;
    return `<div class="wo-hero"><div class="wo-face wo-face-big" data-face="hero"><span class="wo-initial">${esc(h.name[0] || '?')}</span></div>
      <div class="wo-hero-who"><b>${esc(h.name)}</b><span>Level ${whole(h.level)} ${esc(CLASS_NAMES[h.cls] || '')}</span><span class="wo-dim">${esc(chapterOf(atOf(h))?.name || '')} reached</span></div>
      ${change && heroes().length > 1 ? `<button type="button" class="wr-btn wr-small" data-act="pick-hero">${icon('swap')}<span>Change hero</span></button>` : ''}</div>`;
  }
  function face(el, h) {
    if (!el || !h) return;
    const spec = lookSpec(h);
    C().portrait(spec, 128).then(url => { if (url && el.isConnected) el.innerHTML = `<img src="${url}" alt="">`; });
  }
  function entryNote(text) { const p = C().root.querySelector('.wo-entry .wo-note'); if (p) p.textContent = text || ''; }
  function entry(text = '') {
    takeScreen('entry'); backdrop(S.hero ? atOf(S.hero) : chapters()[0].id);
    const root = C().root;
    root.innerHTML = `<section class="wo-screen wo-entry">${head('Online co-op')}
      <div class="wo-scroll"><div class="wo-wrap">
        <div class="wo-entry-hero">${heroCard(S.hero)}</div>
        <p class="wo-note" role="status">${esc(text)}</p>
        <div class="wo-grid">
          <section class="wo-panel"><h2>${icon('people')}Host a room</h2>
            <p class="wo-dim">Up to four heroes. You pick the chapter from your own story.</p>
            <div class="wo-seg" role="group" aria-label="Who can join">
              <button type="button" class="wr-btn wr-small" data-pub="0" aria-pressed="true">${icon('lock')}<span>Invite only</span></button>
              <button type="button" class="wr-btn wr-small" data-pub="1" aria-pressed="false">${icon('globe')}<span>Public</span></button></div>
            <button type="button" class="wr-btn wr-primary wo-wide" data-act="host" ${S.hero ? 'data-primary' : 'disabled'}>${icon('play')}<span>Host a room</span>${kbd('ok')}</button></section>
          <section class="wo-panel"><h2>${icon('user')}Join with a code</h2>
            <p class="wo-dim">Four letters, from the host's screen.</p>
            <form class="wo-code-form"><input class="wo-code-in" maxlength="${CODE_LENGTH}" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Room code" placeholder="ABCD" inputmode="text">
              <button type="submit" class="wr-btn wr-primary" ${S.hero ? '' : 'disabled'}><span>Join</span></button></form></section>
          <section class="wo-panel wo-find"><h2>${icon('map')}Find a game <button type="button" class="wr-btn wr-small" data-act="refresh">${icon('next')}<span>Refresh</span></button></h2>
            <ol class="wo-rooms" aria-live="polite"><li class="wo-dim">Looking for public rooms…</li></ol></section>
        </div>
      </div></div></section>`;
    const el = root.firstElementChild;
    face(el.querySelector('[data-face="hero"]'), S.hero);
    el.querySelector('[data-back]').addEventListener('click', () => { click(); leaveAll(); });
    const setPub = v => { S.pub = v; el.querySelectorAll('[data-pub]').forEach(b => { const on = (b.dataset.pub === '1') === v; b.classList.toggle('wo-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); };
    setPub(S.pub);
    el.querySelectorAll('[data-pub]').forEach(b => b.addEventListener('click', () => { click(); setPub(b.dataset.pub === '1'); }));
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
      click();
      if (b.dataset.act === 'host') host();
      if (b.dataset.act === 'refresh') S.net?.send({ t: 'rooms' });
      if (b.dataset.act === 'pick-hero') pickHero();
      if (b.dataset.act === 'create') { leaveAll(); C().app?.go?.('creator', { then: 'map' }); }
    });
    const input = el.querySelector('.wo-code-in');
    input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    el.querySelector('.wo-code-form').addEventListener('submit', e => {
      e.preventDefault(); click();
      const code = cleanCode(input.value);
      if (!code) { entryNote(input.value.length < CODE_LENGTH ? 'A room code has four letters.' : 'Room codes never use I or O — check the letters.'); input.focus(); return; }
      join(code);
    });
    drawDot();
    if (S.hero) net().then(() => { S.net.send({ t: 'rooms' }); drawDot(); }).catch(() => { entryNote('The online server can\'t be reached right now. Solo and same-screen co-op still work — try again in a minute.'); drawList(true); });
    else drawList();
    clearInterval(S.listTimer);
    S.listTimer = setInterval(() => { if (S.screen !== 'entry') { clearInterval(S.listTimer); return; } S.net?.send({ t: 'rooms' }); }, 6000);
    setTimeout(() => el.querySelector('[data-primary]')?.focus({ preventScroll: true }), 40);
  }
  function drawList(down = false) {
    const ol = C().root.querySelector('.wo-rooms'); if (!ol) return;
    if (down) { ol.innerHTML = '<li class="wo-dim">Can\'t reach the online server.</li>'; return; }
    if (!S.hero) { ol.innerHTML = '<li class="wo-dim">Make a hero to see the rooms.</li>'; return; }
    if (!S.list) return;
    if (!S.list.length) { ol.innerHTML = '<li class="wo-dim">No public rooms right now. Host one and pick Public.</li>'; return; }
    const keep = ol.scrollTop;
    ol.replaceChildren(...S.list.map(r => {
      const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button'; b.className = 'wo-room-card';
      const full = r.players >= r.seats;
      b.innerHTML = `<span class="wo-room-name">${esc(r.host || 'Someone')}'s room</span><span class="wo-room-count">${whole(r.players)} / ${whole(r.seats)}</span>
        <span class="wo-room-meta">${r.chapter ? `Chapter ${whole(r.chapterNo)}: ${esc(r.chapter)}` : 'Choosing a chapter'} · ${r.phase === 'lobby' ? 'in the room' : r.phase === 'play' ? 'mid-chapter — you walk in at the next fight' : 'between chapters'}</span>`;
      if (full) { b.disabled = true; b.querySelector('.wo-room-meta').textContent = 'Full'; } else b.addEventListener('click', () => { click(); join(r.code); });
      li.append(b); return li;
    }));
    ol.scrollTop = keep;
  }
  async function host() {
    if (!S.hero || S.busy) return;
    S.busy = true;
    try { await net(); } catch { S.busy = false; entryNote('The online server can\'t be reached right now. Solo and same-screen co-op still work — try again in a minute.'); return; }
    S.wantRoom = true; S.net.send({ t: 'create', public: S.pub });
  }
  async function join(code) {
    if (!S.hero) { entry('Make a hero first, then use the link again.'); return; }
    if (S.busy) return;
    S.busy = true;
    try { await net(); } catch { S.busy = false; entry('The online server can\'t be reached right now. Solo and same-screen co-op still work — try again in a minute.'); return; }
    S.wantRoom = true; S.net.send({ t: 'join', code });
  }
  function pickHero() {
    const list = heroes();
    const sh = openSheet({ title: 'Your hero', body: `<ol class="wo-pick">${list.map((h, i) => `<li><button type="button" class="wo-pick-row ${h === S.hero ? 'wo-on' : ''}" data-i="${i}"><span class="wo-face" data-face="${i}"><span class="wo-initial">${esc(h.name[0] || '?')}</span></span><span class="wo-pick-who"><b>${esc(h.name)}</b><span>Level ${whole(h.level)} ${esc(CLASS_NAMES[h.cls] || '')}</span></span></button></li>`).join('')}</ol>` });
    list.forEach((h, i) => face(sh.el.querySelector(`[data-face="${i}"]`), h));
    sh.body.addEventListener('click', e => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      click(); S.hero = list[+b.dataset.i]; sh.close();
      if (S.room) { sendMe(); if (me()?.ready) S.net.send({ t: 'ready', on: false }); }
      show(true);
    });
  }

  // ---------------------------------------------------------------- the Room
  function roomScreen() {
    takeScreen('room'); backdrop(S.room.pick);
    const root = C().root;
    root.innerHTML = `<section class="wo-screen wo-room">${head('Room', { backLabel: 'Leave', code: S.room.code })}
      <div class="wo-scroll"><div class="wo-wrap wo-room-grid">
        <div class="wo-col">
          <section class="wo-panel wo-invite"><div class="wo-qr" aria-label="QR code to join"></div>
            <div class="wo-invite-text"><h2>Invite</h2><p class="wo-dim">Scan the code or send the link. Friends can join mid-chapter too.</p>
              <a class="wo-link" target="_blank" rel="noopener"></a>
              <div class="wo-row"><button type="button" class="wr-btn wr-small" data-act="copy">${icon('scroll')}<span>Copy link</span></button><button type="button" class="wr-btn wr-small" data-act="bigqr">${icon('plus')}<span>Big QR</span></button></div></div></section>
          <section class="wo-panel"><h2>${icon('people')}Heroes</h2><ol class="wo-seats"></ol></section>
        </div>
        <div class="wo-col">
          <section class="wo-panel wo-chapter"></section>
          <section class="wo-panel wo-host-only"><h2>${icon('cog')}Room</h2>
            <div class="wo-opt"><span>Who can join</span><div class="wo-seg" role="group" aria-label="Who can join"><button type="button" class="wr-btn wr-small" data-pub="0">${icon('lock')}<span>Invite only</span></button><button type="button" class="wr-btn wr-small" data-pub="1">${icon('globe')}<span>Public</span></button></div></div></section>
          <div class="wo-go"><p class="wo-why" role="status"></p><button type="button" class="wr-btn wr-big wr-primary" data-act="go" data-primary></button></div>
        </div>
      </div></div></section>`;
    const el = root.firstElementChild;
    el.querySelector('[data-back]').addEventListener('click', () => { click(); askLeave(); });
    el.querySelector('[data-act="copy"]').addEventListener('click', async () => { click(); try { await navigator.clipboard.writeText(joinUrl(S.room.code)); note('Invite link copied.'); } catch { note(joinUrl(S.room.code)); } });
    el.querySelector('[data-act="bigqr"]').addEventListener('click', () => { click(); bigQr(); });
    el.querySelectorAll('[data-pub]').forEach(b => b.addEventListener('click', () => { click(); S.net.send({ t: 'opt', key: 'public', value: b.dataset.pub === '1' }); }));
    el.querySelector('[data-act="go"]').addEventListener('click', () => {
      click();
      const r = S.room, mine = me();
      if (r.phase === 'lobby' && isHost()) S.net.send({ t: 'start' });
      else if (r.phase === 'lobby' || r.phase === 'ready') S.net.send({ t: 'ready', on: !mine?.ready });
    });
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-seat]'); if (!b) return;
      click();
      const s = S.room.seats.find(x => x.pid === b.dataset.pid); if (!s) return;
      const act = b.dataset.seat;
      if (act === 'pick-hero') return pickHero();
      if (act === 'host') { if (await C().ask({ title: `Make ${s.name} the host?`, text: 'They pick the chapters and start them. You can\'t take it back yourself.', ok: 'Make host' })) S.net.send({ t: 'host', pid: s.pid }); return; }
      if (act === 'kick') { if (await C().ask({ title: `Remove ${s.name}?`, text: 'They can\'t come back to this room.', ok: 'Remove', danger: true })) S.net.send({ t: 'kick', pid: s.pid }); return; }
      if (act === 'vote') { if (await C().ask({ title: `Vote to remove ${s.name}?`, text: 'They\'re removed when most of the room agrees.', ok: 'Vote', danger: true })) S.net.send({ t: 'vote', pid: s.pid }); }
    });
    drawRoom();
    setTimeout(() => el.querySelector('[data-primary]:not([disabled])')?.focus({ preventScroll: true }), 40);
  }
  function seatBadges(s, r) {
    const out = [];
    if (s.host) out.push('<span class="wo-badge wo-badge-host">Host</span>');
    if (s.away) out.push('<span class="wo-badge wo-badge-away">Away</span>');
    else if (!s.hero) out.push('<span class="wo-badge">Choosing a hero</span>');
    else if (r.phase === 'play') out.push(s.inGame ? '<span class="wo-badge wo-badge-ready">Playing</span>' : '<span class="wo-badge">Joins at the next fight</span>');
    else if (r.phase === 'ready' || (r.phase === 'lobby' && !s.host)) out.push(s.ready ? '<span class="wo-badge wo-badge-ready">Ready</span>' : '<span class="wo-badge">Not ready</span>');
    return out.join('');
  }
  function drawRoom() {
    const el = C().root.querySelector('.wo-room'); if (!el) return;
    const r = S.room, hostMe = isHost();
    el.querySelector('.wo-code').textContent = r.code;
    el.classList.toggle('wo-is-host', hostMe);
    const link = joinUrl(r.code), a = el.querySelector('.wo-link'); a.href = link; a.textContent = link.replace(/^https?:\/\//, '');
    if (S.qr.code !== r.code) { S.qr = { code: r.code, svg: '' }; qrSvg(link).then(svg => { S.qr.svg = svg; const q = C().root.querySelector('.wo-qr'); if (q) q.innerHTML = svg; }).catch(() => {}); }
    else el.querySelector('.wo-qr').innerHTML = S.qr.svg;
    // the four seats
    const ol = el.querySelector('.wo-seats'), others = r.seats.filter(s => !s.away).length - 1, need = Math.floor(Math.max(1, others) / 2) + 1;
    const items = r.seats.map(s => {
      const li = document.createElement('li'); li.className = 'wo-seat' + (s.pid === r.you ? ' wo-you' : '') + (s.away ? ' wo-away' : '');
      const h = s.hero;
      let tools = '';
      if (s.pid === r.you) tools = r.phase === 'lobby' && heroes().length > 1 ? `<button type="button" class="wr-btn wr-small" data-seat="pick-hero" data-pid="${esc(s.pid)}">${icon('swap')}<span>Change hero</span></button>` : '';
      else if (hostMe) tools = `<button type="button" class="wr-btn wr-small" data-seat="host" data-pid="${esc(s.pid)}">${icon('star')}<span>Make host</span></button><button type="button" class="wr-btn wr-small wo-danger" data-seat="kick" data-pid="${esc(s.pid)}">${icon('close')}<span>Remove</span></button>`;
      else tools = `<button type="button" class="wr-btn wr-small wo-danger" data-seat="vote" data-pid="${esc(s.pid)}">${icon('close')}<span>Vote to remove${s.votes ? ` (${whole(s.votes)} of ${whole(need)})` : ''}</span></button>`;
      li.innerHTML = `<div class="wo-face" data-look="${esc(s.pid)}"><span class="wo-initial">${esc((s.name || '?')[0])}</span></div>
        <div class="wo-seat-who"><b>${esc(s.name)}${s.pid === r.you ? ' <small>(you)</small>' : ''}</b><span>${h ? `Level ${whole(h.level)} ${esc(CLASS_NAMES[h.cls] || '')}` : 'No hero yet'}</span></div>
        <div class="wo-badges">${seatBadges(s, r)}</div>${tools ? `<div class="wo-seat-tools">${tools}</div>` : ''}`;
      if (h) {
        const f = li.querySelector('.wo-face'), key = JSON.stringify(h.look);
        const cached = S.faces?.get(key);
        if (cached) f.innerHTML = `<img src="${cached}" alt="">`;
        else C().portrait({ look: h.look }, 128).then(url => { if (!url) return; (S.faces ||= new Map()).set(key, url); const cur = C().root.querySelector(`.wo-seat [data-look="${CSS.escape(s.pid)}"]`); if (cur) cur.innerHTML = `<img src="${url}" alt="">`; });
      }
      return li;
    });
    for (let i = r.seats.length; i < MAX_SEATS; i++) { const li = document.createElement('li'); li.className = 'wo-seat wo-seat-open'; li.innerHTML = '<div class="wo-face"><span class="wo-initial">+</span></div><div class="wo-seat-who"><b>Open seat</b><span>Share the code to fill it</span></div>'; items.push(li); }
    ol.replaceChildren(...items);
    el.querySelectorAll('[data-pub]').forEach(b => { const on = (b.dataset.pub === '1') === r.public; b.classList.toggle('wo-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    drawChapter(el.querySelector('.wo-chapter'));
    // the button: the host starts, everyone else says ready; during the ready check, a countdown
    const go = el.querySelector('[data-act="go"]'), why = el.querySelector('.wo-why'), mine = me();
    const setGo = (label, on = true) => { go.innerHTML = `${icon('play')}<span>${esc(label)}</span>${on ? kbd('ok') : ''}`; go.disabled = !on; };
    if (r.phase === 'ready') {
      const waiting = r.seats.filter(s => s.hero && !s.away && !s.ready);
      setGo(mine?.ready ? 'Not ready' : 'Ready', !!mine?.hero);
      why.textContent = waiting.length ? `Starting in ${whole(r.left ?? 0)} s — waiting for ${waiting.map(s => s.name).join(', ')}.` : 'Everyone is ready.';
      tickCountdown();
    } else if (r.phase === 'play') { setGo('Chapter under way', false); why.textContent = mine?.hero ? 'Your hero walks in at the start of the next fight.' : 'Bring a hero to join in.'; }
    else if (hostMe) {
      const notReady = r.seats.filter(s => s.pid !== r.you && !s.away && s.hero && !s.ready);
      setGo('Start the chapter', !!mine?.hero && !!r.pick);
      why.textContent = !mine?.hero ? 'Choose your hero first.' : notReady.length ? `${notReady.map(s => s.name).join(', ')} ${notReady.length > 1 ? 'aren\'t' : 'isn\'t'} ready yet — Start gives everyone 25 seconds.` : r.seats.length > 1 ? 'Everyone is ready.' : 'Start alone, or share the code first.';
    }
    else { setGo(mine?.ready ? 'Not ready' : 'Ready', !!mine?.hero); why.textContent = 'The host picks the chapter and starts it.'; }
    drawDot();
  }
  function tickCountdown() {
    clearTimeout(S.cdTimer);
    S.cdTimer = setTimeout(() => { if (S.room?.phase === 'ready' && S.screen === 'room') { S.room.left = Math.max(0, (S.room.left ?? 0) - 1); drawRoom(); } }, 1000);
  }
  function drawChapter(box) {
    const r = S.room, hostMe = isHost(), ch = chapterOf(r.pick);
    const pickedHtml = ch ? `<div class="wo-ch-picked"><span class="wo-ch-no">${esc(placeShort(C().data, ch.id))}</span><h2>${esc(ch.name)}</h2><p class="wo-dim">${esc(ch.sub || '')} · ${whole(ch.sections.length)} fights</p></div>` : '<div class="wo-ch-picked"><h2>No chapter yet</h2></div>';
    if (!hostMe || r.phase !== 'lobby') { box.innerHTML = `<h2 class="wo-h-small">${icon('map')}Chapter</h2>${pickedHtml}${hostMe ? '' : '<p class="wo-dim">The host picks from their own story.</p>'}`; return; }
    const keep = box.querySelector('.wo-ch-list')?.scrollTop || 0;
    // the host's own road only (Acts II/III follow the host's choices — no other road is named here)
    const list = (r.road || chapters().map(c => c.id)).map(chapterOf).filter(Boolean);
    box.innerHTML = `<h2 class="wo-h-small">${icon('map')}Chapter</h2><ol class="wo-ch-list">${list.map((c, i) => {
      const open = r.pickable.includes(c.id);
      return `<li><button type="button" class="wo-ch ${c.id === r.pick ? 'wo-on' : ''}" data-ch="${esc(c.id)}" ${open ? '' : 'disabled'} aria-pressed="${c.id === r.pick}"><span class="wo-ch-no">${whole(i + 1)}</span><span class="wo-ch-name"><b>${esc(c.name)}</b><small>${open ? esc(c.sub || '') : 'Reach it in your own story first'}</small></span>${open ? '' : icon('lock')}</button></li>`;
    }).join('')}</ol>`;
    box.querySelector('.wo-ch-list').scrollTop = keep;
    box.querySelectorAll('[data-ch]').forEach(b => b.addEventListener('click', () => { click(); S.net.send({ t: 'pick', chapter: b.dataset.ch }); }));
  }
  function bigQr() {
    const sh = openSheet({ title: `Room ${S.room.code}`, body: `<div class="wo-bigqr">${S.qr.svg}</div><p class="wo-bigqr-code">${esc(S.room.code)}</p><p class="wo-dim wo-center">Scan with a phone camera to join.</p>` });
    sh.el.classList.add('wo-bigqr-sheet');
  }
  async function askLeave() {
    const solo = (S.room?.seats.length || 1) <= 1;
    const playing = S.session && !S.session.closed;
    if (!(await C().ask({ title: 'Leave the room?', text: solo ? 'The room closes when everyone has left.' : playing ? 'Your hero leaves the road; the others play on.' : 'The others keep the room.', ok: 'Leave' }))) return;
    leaveAll();
  }

  // ---------------------------------------------------------------- story scenes
  function speaker(id) {
    const D = C().data;
    if (id === 'hero') { const hs = S.room?.seats.find(s => s.host)?.hero ? S.room.seats.find(s => s.host) : me(); return { name: hs?.name || 'You', spec: hs?.hero ? { look: hs.hero.look } : null }; }
    const sp = D.story.speakers[id] || { name: 'Someone' };
    if (sp.boss) { const b = D.enemies.bosses[sp.boss]; return { name: sp.name, spec: b?.body === 'creature' ? { creature: b.look } : b ? { look: b.look } : null }; }
    if (sp.look) return { name: sp.name, spec: { look: sp.look } };
    return { name: sp.name, spec: null, voice: true };
  }
  /** The staged scene (js/render/stage.js — the same director as the local story screen): the party walks on and the
   *  cast acts each line in the street behind the speech box. The line index stays the room's (every device reads along). */
  function dropStage() {
    if (!S.stage) return;
    const app = C().app;
    try { S.stage.dispose(); } catch (e) { console.error(e); }
    if (app && app.loop === S.stageLoop) app.loop = null;
    S.stage = null; S.stageLoop = null; S.stageLine = -1; S.backdrop = null;
  }
  function buildStage(sc, chId) {
    dropStage();
    const app = C().app, D = C().data;
    if (!sc || !app?.render?.createStage || !app.view || app.view.stub) return;
    const ch = D.chapters.chapters.find(c => c.id === chId);
    const seats = (S.room?.seats || []).filter(s => s.hero && !s.away).sort((a, b) => (b.host ? 1 : 0) - (a.host ? 1 : 0));
    const heroes = seats.map(s => ({ id: s.pid, name: s.name, cls: s.hero.cls, look: s.hero.look, gear: s.hero.gear }));
    try { S.stage = app.render.createStage(app.view, { data: D, scene: sc, chapter: ch, where: ch?.intro === S.scene.id ? 'start' : 'end', heroes }); }
    catch (e) { console.error(e); S.stage = null; }
    if (!S.stage) return;
    S.stageLine = -1;
    S.stageLoop = dt => { S.stage.reveal(S.shownChars); S.stage.update(dt); };
    app.loop = S.stageLoop;
    app.storyStage = S.stage;          // tests read where everyone stands
  }
  function stageSafe() {
    const root = C().root; if (!S.stage || !root) return;
    const top = root.querySelector('.wo-scene-top')?.getBoundingClientRect(), box = root.querySelector('.wo-scene-box')?.getBoundingClientRect();
    const H = innerHeight;
    S.stage.safe({ top: top ? top.bottom + 6 : 56, bottom: box && box.height ? H - box.top + 10 : H * 0.3 });
  }
  function sceneScreen() {
    const sc = C().data.story.scenes[S.scene.id];
    takeScreen('scene');
    const chId = S.room?.pick || chapters().find(c => c.intro === S.scene.id || c.outro === S.scene.id)?.id;
    backdrop(chId);
    buildStage(sc, chId);
    const root = C().root;
    root.innerHTML = `<section class="wo-screen wo-scene">
      <header class="wo-scene-top"><p class="wo-scene-place">${esc(sc?.place || '')}</p><div class="wo-grow"></div>
        <span class="wo-dot" role="status" aria-label="Connection"><i></i><span class="wo-dot-text"></span></span>
        <button type="button" class="wr-btn wr-small" data-act="skip" data-back>${icon('next')}<span>Skip</span>${kbd('back')}</button></header>
      <div class="wo-scene-wait" role="status"></div>
      <div class="wo-scene-box" data-act="next">
        <div class="wo-scene-face"><div class="wo-face wo-face-story"></div></div>
        <div class="wo-scene-words"><p class="wo-scene-name"></p><p class="wo-scene-text" aria-live="polite"></p>
          <p class="wo-scene-more"><span class="wo-scene-count"></span><button type="button" class="wr-btn wr-small" data-act="next" data-primary>${icon('next')}<span>Next</span>${kbd('next')}</button></p></div>
      </div>
      <div class="wo-scene-choice" hidden></div></section>`;
    const el = root.firstElementChild;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'skip') { click(); skipVote(); }
      else if (b.dataset.act === 'next') { e.stopPropagation(); nextLine(); }
      else if (b.dataset.act === 'end') { click(); S.net.send({ t: 'ending', id: b.dataset.id }); }
    });
    drawLine(); drawSceneWait(); drawDot(); stageSafe();
    clearInterval(S.sceneTimer);
    S.sceneTimer = setInterval(() => {
      if (S.screen !== 'scene') { clearInterval(S.sceneTimer); return; }
      const t = C().root.querySelector('.wo-scene-text'); if (!t) return;
      const full = t.dataset.full || '', n = Math.min(full.length, Math.floor((performance.now() - S.lineAt) / 1000 * CPS));
      if (n !== S.shownChars) { S.shownChars = n; t.textContent = full.slice(0, n); }
    }, 30);
  }
  function drawLine() {
    const sc = C().data.story.scenes[S.scene.id], el = C().root.querySelector('.wo-scene'); if (!sc || !el) return;
    const last = S.line >= sc.lines.length;
    const [who, text] = sc.lines[Math.min(S.line, sc.lines.length - 1)];
    const sp = speaker(who);
    el.querySelector('.wo-scene-name').textContent = sp.name;
    el.querySelector('.wo-scene-box').classList.toggle('wo-voice', !!sp.voice);
    el.querySelector('.wo-scene-count').textContent = `${whole(Math.min(S.line + 1, sc.lines.length))} / ${whole(sc.lines.length)}`;
    const t = el.querySelector('.wo-scene-text'); t.dataset.full = text; if (last) t.textContent = text;
    const li = Math.min(S.line, sc.lines.length - 1);
    if (S.stage && S.stageLine !== li) { S.stageLine = li; try { S.stage.line(li); } catch (e) { console.error(e); } }
    const f = el.querySelector('.wo-face-story');
    f.innerHTML = sp.voice ? '<span class="wo-voice-mark"></span>' : `<span class="wo-initial">${esc(sp.name[0] || '?')}</span>`;
    if (sp.spec) C().portrait(sp.spec, 192).then(url => { if (url && f.isConnected && el.querySelector('.wo-scene-name').textContent === sp.name) f.innerHTML = `<img src="${url}" alt="">`; });
    // the last chapter's choice: the host's two buttons; everyone else waits for it
    const ch = el.querySelector('.wo-scene-choice'), choice = S.room?.scene?.choice;
    const atEnd = S.line >= sc.lines.length - 1;
    ch.hidden = !(choice && atEnd);
    if (choice && atEnd) ch.innerHTML = `<p class="wo-choice-prompt">${esc(choice.prompt)}</p>${isHost() ? `<div class="wo-row wo-center">${choice.options.map(o => { const blurb = o.blurb || sc.choice?.options?.find(x => x.id === o.id)?.blurb || ''; return `<button type="button" class="wr-btn wr-big wo-choice-opt ${o === choice.options[0] ? 'wr-primary' : ''}" data-act="end" data-id="${esc(o.id)}"><span>${esc(o.label)}</span>${blurb ? `<small>${esc(blurb)}</small>` : ''}</button>`; }).join('')}</div>` : '<p class="wo-dim wo-center">The host makes this choice for the party.</p>'}`;
    stageSafe();
  }
  function nextLine() {
    const sc = C().data.story.scenes[S.scene?.id]; if (!sc) return;
    const t = C().root.querySelector('.wo-scene-text');
    if (t && S.shownChars < (t.dataset.full || '').length) { S.lineAt = -1e9; return; }      // the first press finishes the line
    click();
    if (S.line < sc.lines.length - 1) { S.line++; S.lineAt = performance.now(); S.shownChars = 0; drawLine(); return; }
    if (!S.room?.scene?.choice) skipVote();
  }
  function skipVote() { if (S.room?.scene?.choice && isHost()) return; const mine = me(); if (!mine?.skip) S.net?.send({ t: 'ready', on: true }); }
  function drawSceneWait() {
    const w = C().root.querySelector('.wo-scene-wait'); if (!w || !S.room) return;
    if (S.room.scene?.id && S.scene?.id !== S.room.scene.id) { S.scene = { id: S.room.scene.id, kind: S.room.scene.kind }; S.line = 0; S.lineAt = performance.now(); drawLine(); }
    const mine = me(), waiting = S.room.seats.filter(s => !s.away && !s.skip);
    w.textContent = mine?.skip ? (waiting.length ? `Waiting for ${waiting.map(s => s.name).join(', ')} to finish the scene.` : '') : '';
    w.hidden = !w.textContent;
    const skip = C().root.querySelector('[data-act="skip"]'); if (skip) skip.disabled = !!mine?.skip || !!(S.room.scene?.choice && isHost());
  }

  // ---------------------------------------------------------------- lost / results
  function lostScreen() { takeScreen('lost'); backdrop(S.room.pick); C().root.innerHTML = '<section class="wo-screen wo-end wo-lost"><div class="wo-scroll"><div class="wo-card"></div></div></section>'; drawLost(); }
  function drawLost() {
    const card = C().root.querySelector('.wo-lost .wo-card'); if (!card) return;
    const r = S.room, ch = chapterOf(r.pick), hostMe = isHost();
    card.innerHTML = `<p class="wo-kicker">${esc(ch?.name || '')}</p><h1>The road beat you this time</h1>
      <p class="wo-dim">Every hero is out of lives${r.lost ? ` at ${esc(r.lost.label.toLowerCase())}` : ''}.</p>
      ${hostMe ? `<div class="wo-row wo-center"><button type="button" class="wr-btn wr-big wr-primary" data-act="retry" data-primary>${icon('play')}<span>Again from this fight</span>${kbd('ok')}</button>
        <button type="button" class="wr-btn wr-big" data-act="room" data-back>${icon('back')}<span>Back to the room</span>${kbd('back')}</button></div>` : '<p class="wo-wait">The host decides: again from this fight, or back to the room.</p>'}`;
    card.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => { click(); S.net.send({ t: 'retry', on: b.dataset.act === 'retry' }); }));
    setTimeout(() => card.querySelector('[data-primary]')?.focus({ preventScroll: true }), 40);
  }
  function resultsScreen() { takeScreen('results'); backdrop(S.room.pick); C().root.innerHTML = '<section class="wo-screen wo-end wo-results"><div class="wo-scroll"><div class="wo-card"></div></div></section>'; drawResults(); }
  /** The host's choice at a fork, and an ending found: every save in the room follows the host's road. */
  function choiceHtml(res) {
    const D = C().data, out = [];
    if (res.choice) {
      const sc = Object.values(D.story.scenes).find(x => x.choice?.options?.some(o => o.id === res.choice.pick));   // option ids are unique across the forks
      const opt = sc?.choice?.options?.find(o => o.id === res.choice.pick);
      out.push(`<p class="wo-choice-made">${icon('map')}<span>${isHost() ? 'You chose' : 'The host chose'}: <b>${esc(opt?.label || 'a road')}</b>. Every hero here walks that road now.</span></p>`);
    }
    const E = res.finale && D.acts?.endings?.[res.finale];
    if (E) out.push(`<section class="wr-ending-card"><p class="wr-kicker">Ending found</p><h3>${icon('star')}<span>${esc(E.name)}</span></h3><p class="wr-ending-line">${esc(E.line)}</p></section>`);
    return out.join('');
  }
  function drawResults() {
    const card = C().root.querySelector('.wo-results .wo-card'), res = S.result || S.room?.result; if (!card || !res) return;
    const won = res.outcome === 'won', next = res.next && chapterOf(res.next);
    const rows = res.players.map(p => {
      const seat = S.room.seats.find(s => s.pid === p.pid);
      return `<li class="wo-res ${p.pid === S.room.you ? 'wo-you' : ''}"><div class="wo-face" data-res="${esc(p.pid)}"><span class="wo-initial">${esc((p.name || '?')[0])}</span></div>
        <div class="wo-seat-who"><b>${esc(p.name)}${p.pid === S.room.you ? ' <small>(you)</small>' : ''}</b><span>Level ${whole(p.level)} ${esc(CLASS_NAMES[p.cls] || '')}</span></div>
        <dl class="wo-res-nums"><div><dt>Experience</dt><dd>+${whole(p.xpGained)}</dd></div><div><dt>Gold</dt><dd>${icon('gold')}${whole(p.gold)}</dd></div><div><dt>Foes beaten</dt><dd>${whole(p.kills)}</dd></div></dl>${seat ? '' : '<span class="wo-badge wo-badge-away">Left</span>'}</li>`;
    }).join('');
    card.innerHTML = `<p class="wo-kicker">${esc(res.name)}</p><h1>${won ? 'Chapter cleared' : 'The party turned back'}</h1>
      <p class="wo-dim">${timeText(res.time)} on the road · ${whole(res.kills)} foes beaten${won && next ? ` · ${esc(next.name)} is open now` : ''}</p>
      ${choiceHtml(res)}
      <ol class="wo-res-list">${rows}</ol>
      <div class="wo-row wo-center">${isHost() ? `<button type="button" class="wr-btn wr-big wr-primary" data-act="back" data-primary>${icon('people')}<span>Back to the room</span>${kbd('ok')}</button>` : `<p class="wo-wait">Back to the room in ${whole(S.room.left ?? 0)} s, or when the host is ready.</p>`}</div>`;
    card.querySelector('[data-act="back"]')?.addEventListener('click', () => { click(); S.net.send({ t: 'back' }); });
    for (const p of res.players) { const seat = S.room.seats.find(s => s.pid === p.pid); const f = card.querySelector(`[data-res="${CSS.escape(p.pid)}"]`); if (seat?.hero && f) C().portrait({ look: seat.hero.look }, 128).then(url => { if (url && f.isConnected) f.innerHTML = `<img src="${url}" alt="">`; }); }
    setTimeout(() => card.querySelector('[data-primary]')?.focus({ preventScroll: true }), 40);
  }

  const api = { leave: leaveAll, get state() { return onlineState(); } };
  return { get ctx() { return S.ctx; }, set ctx(v) { S.ctx = v; if (!S.hero) S.hero = v.hero || v.save?.heroes?.[0] || null; }, show, join, api,
    get screen() { return S.screen; }, get net() { return S.net; }, get room() { return S.room; }, get session() { return S.session; } };
}
