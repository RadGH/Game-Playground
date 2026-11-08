// "Learn by doing" (Expansion 1 M3): the intro card's how-to lines with pictures of the controls, the practice copy
// that runs while the card is up (js/client/practice.js), and the hints that show the main move.
//
// Flow on a player's phone during the intro:
//   * the card opens with ONE goal line and ONE controls line ([stick] / [A] / [B] / [tap]… drawn as the real
//     controls), the old rule lines folded under "More rules", and "Your controls work now — try them!"
//   * behind it this phone runs its own copy of the game (nothing counts, nothing is sent). Moving the stick or
//     pressing a button on an arena game, or "Try it" on any game, shrinks the card to a slim bar at the top
//     ("Practice — nothing counts", Rules, I'm ready) so the game can be seen and played
//   * a ghost thumb on the stick and a pulsing ring on the A button (arena) or a pointing finger at the first thing to
//     tap (screen games) show the main move, each labelled from the controls line, until the player has done it
//   * "I'm ready" (or 2.5 s before the intro ends, or the game starting) ends practice: the copy is freed and the real
//     game is built behind the card exactly as before. The room's rule is unchanged (it starts when every person is ready)
//   * if the practice copy cannot run, the LIGHTER version: the controls panel is live (buttons light up, an arrow
//     follows the stick), nothing moves in the arena. A big screen (TV) or someone watching never practises.
import { createPractice } from './practice.js';
import { HOWTO } from '../games/howto.js';
import { parseCtl, fallbackHowto } from '../games/howto-kit.js';
import { inputKind } from './buttons.js';
import { isTouch } from './controls.js';
import { esc } from './gamehud.js';
import { IN } from '../shared/protocol.js';

/** The goal + controls lines for a game (the audited row, or one made from its meta for a game not audited yet). */
export const howtoFor = (id, meta) => HOWTO[id] || fallbackHowto(meta || {});

const EMOJI = { tap: '👆', drag: '✍️', hold: '✊', type: '⌨️' };
/** One control's picture, for the device in hand: a phone sees the real button (its label), a keyboard sees the key. */
export function ctlIcon(tok, meta, device = inputKind()) {
  const c = meta?.controls || {}, keys = device === 'keys';
  if (tok === 'stick') return keys ? '<kbd class="ci-key">WASD</kbd>' : '<i class="ci ci-stick" aria-label="move stick"><b></b></i>';
  if (tok === 'A' || tok === 'B') {
    const label = String(c[tok.toLowerCase()] || tok);
    if (keys) return `<kbd class="ci-key">${tok === 'A' ? 'Space' : 'E'}</kbd>`;
    const txt = device === 'pad' ? tok : label.toUpperCase();
    return `<i class="ci ci-${tok.toLowerCase()}${txt.length > 6 ? ' long' : ''}" aria-label="${esc(label)} button">${esc(txt)}</i>`;
  }
  if (tok === 'tap' && keys) return '<i class="ci ci-tap" aria-label="click">🖱️</i>';
  return `<i class="ci ci-${tok}" aria-label="${tok}">${EMOJI[tok] || ''}</i>`;
}
/** The controls line as HTML: each segment its picture + its words. */
export function ctlHtml(meta, line) {
  return parseCtl(line).map(s => `<span class="ctl-seg">${s.tok ? ctlIcon(s.tok, meta) : ''}<span>${esc(s.text)}</span></span>`).join('');
}

export function createLearn({ stage, controls, members, uiRoot, sfx, buildReal, redraw, endsAt }) {
  const L = { state: 'off', small: false, practice: null, game: null, meta: null, ends: false, light: null };
  let hintsEl = null, hintTimer = null, nearTimer = null, used = new Set(), segs = [];

  // ---------------------------------------------------------------- lifecycle
  /** Start practising this intro (pm = the intro phase message, me = this player's pid). */
  async function begin(pm, me, meta) {
    drop();
    L.state = 'loading'; L.small = false; L.game = pm.game; L.meta = meta; L.ends = false; used = new Set();
    segs = parseCtl(howtoFor(pm.game, meta).ctl);
    document.body.classList.add('practicing');
    showHints();
    nearTimer = setInterval(() => { if (L.state !== 'off' && L.state !== 'done' && endsAt() - performance.now() < 2500) end(); }, 250);
    const game = pm.game;
    try {
      const p = await createPractice({ stage, controls, intro: pm, members, me, uiRoot, sfx,
        onUse: k => { used.add(k); if (k !== 'tap' && !L.small && meta.kind === 'arena') setSmall(true); placeHints(); },
        onFail: () => { if (L.game === game && L.state === 'live') goLight(); } });
      if (L.game !== game || L.state !== 'loading') { p.stop({ quiet: true }); return; }   // too late: the real game may own the controls now
      L.practice = p; L.state = 'live'; redraw();
    } catch (e) {
      console.error('practice could not start', game, e);
      if (L.game === game && L.state === 'loading') goLight();
    }
  }
  /** The lighter version: the real game is built behind the card (as before) and the controls panel is live. */
  function goLight() {
    L.practice?.stop(); L.practice = null; L.state = 'light';
    buildReal();
    if (L.meta?.kind === 'arena') controls.set({ stick: true, ...L.meta.controls });
    clearInterval(L.light); let dirEl = null;
    L.light = setInterval(() => {            // nothing reads the controls until the game starts: show what they do
      if (!controls.shown || L.state !== 'light') return;
      const r = controls.read();
      if (r.mx || r.mz) used.add('move'); if (r.b & IN.A) used.add('a'); if (r.b & IN.B) used.add('b');
      dirEl ||= hintsEl?.querySelector('.lh-dir');
      if (dirEl) { const on = !!(r.mx || r.mz); dirEl.classList.toggle('on', on); if (on) dirEl.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(r.mz, r.mx)}rad)`; }
      hintsEl?.querySelector('.lh-btns')?.classList.toggle('a', !!(r.b & IN.A));
      hintsEl?.querySelector('.lh-btns')?.classList.toggle('b', !!(r.b & IN.B));
    }, 50);
    redraw();
  }
  /** Practice is over for this phone (ready tapped, time nearly up, or the game started): build the real game. */
  function end() {
    if (L.state === 'off' || L.state === 'done') return;
    const wasLight = L.state === 'light';
    stopAll(); L.state = 'done'; L.small = false;
    if (!wasLight) buildReal();
    redraw();
  }
  /** Leave without building anything (the phase moved on, the room was left). */
  function drop() { stopAll(); L.state = 'off'; L.game = null; L.small = false; }
  function stopAll() {
    L.practice?.stop(); L.practice = null;
    clearInterval(nearTimer); nearTimer = null; clearInterval(L.light); L.light = null; clearInterval(hintTimer); hintTimer = null;
    hintsEl?.remove(); hintsEl = null;
    document.body.classList.remove('practicing', 'practice-small');
    if (L.state === 'light') controls.set(null);
  }
  function setSmall(v) { L.small = !!v; document.body.classList.toggle('practice-small', L.small); redraw(); placeHints(); }

  // ---------------------------------------------------------------- hints
  // Positioned over the real controls (read from the page every 300 ms: they move with the safe area and rotation).
  function showHints() {
    hintsEl = document.createElement('div'); hintsEl.className = 'learn-hints'; hintsEl.setAttribute('aria-hidden', 'true');
    const seg = t => segs.find(s => s.tok === t);
    const stick = seg('stick'), a = seg('A'), b = seg('B'), tap = segs.find(s => ['tap', 'drag', 'hold', 'type'].includes(s.tok));
    hintsEl.innerHTML = `${stick ? `<div class="lh lh-stick"><i class="lh-ghost"></i><span>${esc(stick.text)}</span></div>` : ''}
      ${a ? `<div class="lh lh-a"><i class="lh-ring"></i><span>${esc(a.text)}</span></div>` : ''}
      ${b ? `<div class="lh lh-b"><i class="lh-ring"></i><span>${esc(b.text)}</span></div>` : ''}
      ${tap ? `<div class="lh lh-tap"><i class="lh-finger">${tap.tok === 'drag' ? '✍️' : '👆'}</i><span>${esc(tap.text)}</span></div>` : ''}
      <div class="lh-light"><i class="lh-dir"></i><span class="lh-btns">${L.meta?.controls?.a ? '<b class="la">A</b>' : ''}${L.meta?.controls?.b ? '<b class="lb">B</b>' : ''}</span></div>`;
    document.body.append(hintsEl);
    hintTimer = setInterval(placeHints, 300); placeHints();
  }
  const rectOf = sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.width || r.height ? r : null; };
  const put = (el, x, y, show) => { if (!el) return; el.classList.toggle('on', !!show); if (show) { el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px'; el.classList.toggle('edge-l', x < innerWidth * 0.3); el.classList.toggle('edge-r', x > innerWidth * 0.7); } };
  function placeHints() {
    if (!hintsEl) return;
    const cardOpen = !L.small && L.state !== 'done', touch = isTouch(), live = L.state === 'live';
    hintsEl.classList.toggle('light', L.state === 'light');
    hintsEl.classList.toggle('keys', !touch);
    // arena: the ghost thumb sits on the stick's resting place, the ring on the A / B button
    const stick = rectOf('#controls.on .ph-stick .ph-ring'), a = rectOf('#controls.on .ph-a'), b = rectOf('#controls.on .ph-b');
    const going = (live || L.state === 'light') && touch && !cardOpen;   // the open card sits over the controls: hints once it steps aside
    put(hintsEl.querySelector('.lh-stick'), stick ? stick.left + stick.width / 2 : 0, stick ? stick.top + stick.height / 2 : 0, going && stick && !used.has('move'));
    put(hintsEl.querySelector('.lh-a'), a ? a.left + a.width / 2 : 0, a ? a.top + a.height / 2 : 0, going && a && !used.has('a') && (used.has('move') || !hintsEl.querySelector('.lh-stick')));
    put(hintsEl.querySelector('.lh-b'), b ? b.left + b.width / 2 : 0, b ? b.top + b.height / 2 : 0, going && b && used.has('a') && !used.has('b'));
    const keyHint = document.querySelector('#controls.on .key-hint');
    keyHint?.classList.toggle('learn-pulse', (live || L.state === 'light') && !touch && !(used.has('move') && used.has('a')));
    // screen games: point at the first thing that can be tapped, once the card has stepped aside
    let target = null;
    if (live && L.small && L.meta?.kind !== 'arena' && !used.has('tap')) {
      for (const e of uiRoot.querySelectorAll('.game button:not([disabled]), .game [data-i], .game [data-k], .game [role=button], .game canvas')) {
        const r = e.getBoundingClientRect(); if (r.width < 20 || r.height < 20 || r.bottom < 0 || r.top > innerHeight) continue;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit && (hit === e || e.contains(hit))) { target = r; break; }
      }
    }
    put(hintsEl.querySelector('.lh-tap'), target ? target.left + target.width / 2 : 0, target ? target.top + target.height / 2 : 0, !!target);
    const lightEl = hintsEl.querySelector('.lh-light');
    if (lightEl) lightEl.classList.toggle('on', L.state === 'light' && L.meta?.kind === 'arena' && !cardOpen);
  }

  // ---------------------------------------------------------------- the card's practice parts
  /** The line under the how-to on the open card. */
  function cardNote(can) {
    if (!can) return '';
    if (L.state === 'loading') return '<p class="practice-note">Getting a practice round ready…</p>';
    if (L.state === 'live') return `<div class="practice-row"><p class="practice-note"><b>Practice now:</b> your controls already work. Nothing counts.</p><button class="btn" data-learn="try">Try it ▸</button></div>`;
    if (L.state === 'light') return `<div class="practice-row"><p class="practice-note"><b>Try the controls:</b> they light up when you press them. Nothing counts.</p>${L.meta?.kind === 'arena' ? '<button class="btn" data-learn="try">Try them ▸</button>' : ''}</div>`;
    return '';
  }
  /** The slim bar shown while practising with the card out of the way. `ready` = the ready button html, `count` = the note. */
  function smallBar(title, ready, count) {
    return `<div class="panel practice-bar"><div class="pb-text"><b>Practice</b> — nothing counts<small>${esc(title)} · ${count}</small></div>
      <button class="btn small" data-learn="rules">Rules</button>${ready}</div>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-learn]'); if (!b) return;
    sfx?.('tap');
    if (b.dataset.learn === 'try') setSmall(true);
    else if (b.dataset.learn === 'rules') setSmall(false);
  });

  return {
    begin, end, drop, goLight, setSmall, cardNote, smallBar,
    frame: dt => L.practice?.frame(dt),
    get state() { return L.state; }, get small() { return L.small && (L.state === 'live' || L.state === 'light'); },
    get practising() { return L.state === 'loading' || L.state === 'live' || L.state === 'light'; },
    get rounds() { return L.practice?.rounds || 0; },
    /** For specs: where this player's practice character stands, and what has been tried. */
    debug: () => ({ state: L.state, small: L.small, used: [...used], rounds: L.practice?.rounds || 0, me: (() => { const p = L.practice?.play, a = p?.players?.[0] && p.actor(p.players[0].pid); return a ? { x: a.group.position.x, z: a.group.position.z } : null; })(), uiGames: uiRoot.querySelectorAll('.game').length }),
  };
}
