// Round 12 (2026-10-24): the board's live events, drawn as a card docked at the bottom of every phone (never a modal
// over the board). Everyone sees the same thing as it happens; the players the event is waiting for get the buttons.
// The server decides everything (js/sim/board.js); this file only draws what it is told, plus the moving parts of
// the timing games (the High Striker's bar, the wheel), which use the same pure functions as the server
// (js/shared/board-rules.js), so what you saw when you tapped is what you get.
//   const dock = createEventDock({ me: () => pid, nameOf, faceOf, send: i => net.send({ t: 'choose', i }), sfx });
//   dock.onEvent(bdEvent) -> true if it was an event message; dock.el goes in the board's foot; dock.clear().
import { strikePower, shellAfter } from '../shared/board-rules.js';
import { esc } from './gamehud.js';

export const RULES = await (await fetch(new URL('../../data/chance.json', import.meta.url))).json().catch(() => ({}));
export const ITEMS = RULES.board?.items || {};

/** Title + the one line that says what to do (what a watcher reads too). */
export const EVENT_INFO = {
  duel: { title: 'Dice Duel', how: e => `Both roll. Higher roll takes ${e.stake} tickets.` },
  striker: { title: 'High Striker', how: () => 'Tap when the bar is at the top. Ring the bell!' },
  wheel: { title: 'Wheel of Whatever', how: () => 'Tap to stop the wheel.' },
  shell: { title: 'Shell Game', how: e => e.stage === 'hide' ? 'Hide the pea under a cup.' : e.stage === 'shuffle' ? 'Watch the pea…' : 'Which cup hides the pea?' },
  pact: { title: 'Steal or Share', how: e => `Pick in secret. Both share: ${Math.floor(e.pot / 2)} each. One steals: ${e.pot} to the thief.` },
  crowd: { title: 'Tomato Toss', how: e => `Everyone throws! Most tomatoes goes back ${e.back}.` },
  fortune: { title: 'Fortune Teller', how: () => 'Pick a card, any card.' },
  duck: { title: 'Duck Pond', how: () => 'Pick a duck: each hides 1 to 10 tickets.' },
};
const COLOURS = ['#ff5f8f', '#ffd23f', '#5cc8ff', '#8cf06a', '#a45cff', '#ff9f1c', '#39d0e0', '#ff8fc8'];

export function createEventDock({ me, nameOf, faceOf, send, sfx = () => {} }) {
  const el = document.createElement('div'); el.className = 'ev-dock'; el.hidden = true;
  let E = null, raf = 0, last = 0;
  const now = () => performance.now();
  const mine = () => E && E.stage !== 'shuffle' && E.pids.includes(me()) && !(me() in E.inp) && !E.result;
  const nm = p => esc(nameOf(p));

  function open(ev) {
    const keep = E && E.kind === ev.kind && E.pid === ev.pid && !E.result;      // a new stage of the same event (the shell game)
    E = { ...(keep ? E : { inp: {}, result: null }), ...ev, t0: now() };
    if (!keep || ev.stage === 'guess') E.inp = {};
    if (ev.kind === 'shell' && ev.stage === 'shuffle') { E.cupAt = [0, 1, 2]; }
    render(); start();
  }
  /** One message from the server. -> true if it belonged to the dock. */
  function onEvent(ev) {
    if (ev.ev === 'event') { open(ev); sfx(ev.kind === 'crowd' ? 'open' : 'turn'); if (ev.pids?.includes(me())) navigator.vibrate?.(40); return true; }
    if (ev.ev === 'ask' && ev.kind === 'duck') { open({ kind: 'duck', pid: ev.pid, pids: [ev.pid], ms: ev.ms, options: ev.options }); return true; }
    if (!E) return false;
    if (ev.ev === 'evin' && ev.kind === E.kind) {
      E.inp[ev.pid] = { ...ev, at: now() };
      if (ev.kind === 'striker' || ev.kind === 'wheel') E.stopAt = now();
      if (ev.kind === 'duel') sfx('dice'); else if (ev.kind === 'crowd') sfx('throw'); else sfx('tap');
      render(); return true;
    }
    if (ev.ev === 'chose' && E.kind === 'duck') { E.inp[ev.pid] = { pick: ev.i }; render(); return true; }
    if (ev.ev === 'fx' && (ev.kind === E.kind || (E.kind === 'wheel' && ev.kind === 'chance'))) { E.result = ev; E.resultAt = now(); render(); return true; }
    return false;
  }
  function clear() { E = null; el.hidden = true; el.innerHTML = ''; cancelAnimationFrame(raf); raf = 0; }
  function start() { if (!raf) { last = now(); raf = requestAnimationFrame(loop); } }
  function loop(t) { raf = 0; if (!E) return; tick(t); raf = requestAnimationFrame(loop); }

  // ---------------------------------------------------------------- drawing
  const who = (p, extra = '') => `<span class="ev-who${p === me() ? ' me' : ''}">${faceOf(p)}<b>${p === me() ? 'You' : nm(p)}</b>${extra}</span>`;
  function render() {
    if (!E) return;
    el.hidden = false; el.dataset.kind = E.kind;
    const info = EVENT_INFO[E.kind] || { title: E.kind, how: () => '' };
    const waiting = E.pids.filter(p => !(p in E.inp));
    const status = E.result ? '' : mine() ? '<em class="ev-you">Your tap!</em>' : waiting.length ? `<em>Waiting for ${waiting.slice(0, 3).map(nm).join(', ')}…</em>` : '';
    el.innerHTML = `<div class="ev-head"><b>${info.title}</b><span>${esc(info.how(E))}</span>${status}</div>
      <div class="ev-timer"${E.result ? ' hidden' : ''}><i></i></div>
      <div class="ev-body">${body()}</div>
      ${E.result ? `<div class="ev-result ${(E.result.d ?? 0) < 0 ? 'bad' : 'good'}">${esc(E.result.text || '')}</div>` : ''}`;
    for (const b of el.querySelectorAll('[data-ev]')) {
      // pointerdown, not click: the timing games count the moment the finger lands
      b.addEventListener('pointerdown', e => { e.preventDefault(); if (!mine()) return; const v = b.dataset.ev === 'ms' ? Math.round(now() - E.t0) : +b.dataset.ev; E.tapped = true; send(v); b.disabled = true; b.classList.add('sent'); sfx('tap'); });
    }
    E.canvas = el.querySelector('canvas'); E.fill = el.querySelector('.ev-meter i'); E.puck = el.querySelector('.ev-puck'); E.bar = el.querySelector('.ev-timer i');
    E.dice = [...el.querySelectorAll('.ev-die')]; E.cups = [...el.querySelectorAll('.cup')]; E.pea = el.querySelector('.pea');
    tick(now());
  }
  function body() {
    const go = (label, v = 'ms', cls = '') => mine() ? `<button class="btn big primary ev-go ${cls}" data-ev="${v}">${label}</button>` : '';
    switch (E.kind) {
      case 'duel': {
        const res = E.result, pair = E.pids.map(p => {
          const n = E.inp[p]?.n, won = res && res.winner === p;
          return `<div class="ev-duelist${won ? ' won' : ''}">${who(p)}<div class="ev-die${n ? ' landed' : ''}" data-p="${p}">${n || '?'}</div>${res && res.winner != null ? `<small>${won ? `+${Math.abs(res.d)}` : `−${Math.abs(res.d)}`}</small>` : ''}</div>`;
        });
        return `<div class="ev-duel">${pair.join('<b class="vs">VS</b>')}</div>${go('ROLL!', '0')}`;
      }
      case 'striker': {
        const tiers = (E.tiers || []).filter(t => t.min > 0).map(t => `<i class="tier" style="bottom:${t.min}%"><span>${esc(t.label)} +${t.n}</span></i>`).join('');
        return `<div class="ev-striker"><div class="ev-tower">${tiers}<div class="ev-bell"></div><div class="ev-puck"></div></div>
          <div class="ev-side">${who(E.pid)}<div class="ev-meter"><i></i></div>${go('SWING!')}</div></div>`;
      }
      case 'wheel': return `<div class="ev-wheel"><div class="ev-wheelbox"><canvas width="240" height="240"></canvas><i class="ev-pointer"></i></div><div class="ev-side">${who(E.pid)}${go('STOP!')}</div></div>`;
      case 'shell': {
        const hider = E.pid, guesser = E.with, res = E.result;
        const cups = [0, 1, 2].map(k => `<button class="cup" data-cup="${k}" ${(E.stage === 'hide' && mine()) || (E.stage === 'guess' && mine()) ? `data-ev="${k}"` : 'disabled'}><span></span></button>`).join('');
        return `<div class="ev-shell"><div class="ev-pair">${who(hider, ' <small>hides</small>')}${who(guesser, ' <small>guesses</small>')}</div>
          <div class="cups${res ? ' lifted' : ''}">${cups}<i class="pea"></i></div></div>`;
      }
      case 'pact': {
        const res = E.result;
        const cards = E.pids.map((p, k) => {
          const pick = res ? res.picks[k] : null;
          return `<div class="ev-pcard${pick === 1 ? ' steal' : pick === 0 ? ' share' : ''}">${who(p)}<b>${pick === 1 ? 'STEAL' : pick === 0 ? 'SHARE' : p in E.inp ? 'Locked in' : '…'}</b></div>`;
        }).join('');
        return `<div class="ev-pact"><div class="ev-pot">Pot: ${E.pot} tickets</div><div class="ev-pair">${cards}</div>
          ${mine() ? '<div class="row ev-choices"><button class="btn big share" data-ev="0">Share</button><button class="btn big steal" data-ev="1">Steal</button></div>' : ''}</div>`;
      }
      case 'crowd': {
        const count = {}; for (const v of Object.values(E.inp)) if (v.vote != null) count[v.vote] = (count[v.vote] || 0) + 1;
        const hit = new Set(E.result?.hit || []), voting = mine();
        return `<div class="ev-crowd">${E.options.map((p, k) => `<button class="ev-target${hit.has(p) ? ' hit' : ''}" ${voting && p !== me() ? `data-ev="${k}"` : 'disabled'}>${who(p)}<span class="tomatoes">${'<i class="tomato"></i>'.repeat(count[p] || 0)}</span></button>`).join('')}</div>
          ${voting ? '<p class="ev-hint">Tap who gets a tomato</p>' : ''}`;
      }
      case 'fortune': {
        const res = E.result;
        const cards = [0, 1, 2].map(k => {
          const c = res?.cards?.[k] || E.inp[E.pid]?.cards?.[k], face = c ? (c.item ? `<b>${esc(ITEMS[c.item]?.name || c.item)}</b><small>${esc(ITEMS[c.item]?.short || '')}</small>` : `<b>+${c.tickets}</b><small>tickets</small>`) : '<b>?</b>';
          const picked = (res?.pick ?? E.inp[E.pid]?.pick) === k;
          return `<button class="ev-fcard${c ? ' up' : ''}${picked ? ' picked' : ''}" ${mine() ? `data-ev="${k}"` : 'disabled'}>${face}</button>`;
        }).join('');
        return `<div class="ev-fortune">${who(E.pid)}<div class="row">${cards}</div></div>`;
      }
      case 'duck': {
        const res = E.result, pick = res?.pick ?? E.inp[E.pid]?.pick;
        return `<div class="ev-ducks">${who(E.pid)}<div class="row">${['yellow', 'blue', 'pink'].map((c, k) => `<button class="ev-duck d${k}${pick === k ? ' picked' : ''}" ${mine() ? `data-ev="${k}"` : 'disabled'} aria-label="${c} duck">${DUCK}${res ? `<b>+${res.prizes[k]}</b>` : ''}</button>`).join('')}</div></div>`;
      }
    }
    return '';
  }

  // ---------------------------------------------------------------- moving parts
  function tick(t) {
    if (!E) return;
    const el2 = t - E.t0;
    if (E.bar && !E.result) E.bar.style.transform = `scaleX(${Math.max(0, 1 - el2 / (E.ms || 1))})`;
    if (E.kind === 'duel') for (const d of E.dice) if (!d.classList.contains('landed') && t - last > 70) d.textContent = 1 + Math.floor(Math.random() * 6);
    if (E.kind === 'striker') {
      const got = E.inp[E.pid];
      const p = got ? got.power : E.result ? E.result.power : strikePower(el2, E.period || 1300);
      if (E.fill) E.fill.style.height = `${p}%`;
      if (E.puck) { const k = got ? Math.min(1, (t - (E.stopAt || t)) / 800) : 0, h = got ? got.power * Math.sin(k * Math.PI / 2) : 0; E.puck.style.bottom = `${h}%`; if (got && got.power >= 95 && k >= 1 && !E.rang) { E.rang = true; el.querySelector('.ev-bell')?.classList.add('ring'); sfx('win'); } }
    }
    if (E.kind === 'wheel' && E.canvas) drawWheel(t);
    if (E.kind === 'shell') drawShell(t);
    if (t - last > 70) last = t;
  }
  function drawWheel(t) {
    const segs = E.segs || [], n = segs.length || 8, segMs = E.segMs || 130, segA = Math.PI * 2 / n;
    let ms = t - E.t0;
    const got = E.inp[E.pid];
    if (got) {        // ease from where it was to the middle of the segment it stopped on, at least one more turn
      if (E.wFrom == null) { E.wFrom = (E.stopAt - E.t0); const base = Math.ceil((E.wFrom / segMs + n) / n) * n; E.wTo = (base + got.seg + 0.5) * segMs; }
      const k = Math.min(1, (t - E.stopAt) / 1100), e = 1 - Math.pow(1 - k, 3); ms = E.wFrom + (E.wTo - E.wFrom) * e;
    } else if (E.result) ms = (E.wTo ?? ms);
    const c = E.canvas, g = c.getContext('2d'), W = c.width, R = W / 2 - 6, rot = -(ms / segMs) * segA;
    g.clearRect(0, 0, W, W); g.save(); g.translate(W / 2, W / 2);
    // pointer at the top: segment k spans [k, k+1) * segA measured clockwise from the top in wheel space
    g.rotate(rot - Math.PI / 2);
    for (let k = 0; k < n; k++) {
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, k * segA, (k + 1) * segA); g.closePath();
      g.fillStyle = COLOURS[k % COLOURS.length]; g.fill(); g.lineWidth = 3; g.strokeStyle = '#12222a'; g.stroke();
      g.save(); g.rotate((k + 0.5) * segA); g.fillStyle = '#12222a'; g.font = '900 15px system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText(String(segs[k]?.label || '?').slice(0, 11), R - 8, 0); g.restore();
    }
    g.restore();
    g.beginPath(); g.arc(W / 2, W / 2, 16, 0, 7); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#12222a'; g.stroke();
    if (E.result && !E.flash) { E.flash = true; c.classList.add('stopped'); }
  }
  function drawShell(t) {
    if (!E.cups.length) return;
    const slotX = s => `${s * 100}%`;
    let cupAt = [0, 1, 2], lift = E.stage === 'hide' ? 0 : -1, peaSlot = null;   // cupAt[slot] = which cup stands there
    if (E.stage === 'shuffle' || E.stage === 'guess' || E.result) {
      const swaps = E.swaps || E.prevSwaps || [], swapMs = E.swapMs || 330, ms = E.stage === 'shuffle' ? t - E.t0 - 250 : 1e9;
      if (E.stage === 'shuffle') { E.prevSwaps = swaps; E.prevPea = E.pea; }
      const pea = E.pea ?? E.prevPea;
      const done = Math.max(0, Math.min(swaps.length, Math.floor(ms / swapMs)));
      for (let k = 0; k < done; k++) { const [a, b] = swaps[k]; [cupAt[a], cupAt[b]] = [cupAt[b], cupAt[a]]; }
      const pos = [0, 0, 0]; cupAt.forEach((cup, s) => { pos[cup] = s; });
      const lifts = [0, 0, 0];
      if (done < swaps.length && ms >= 0) {     // mid-swap: the two cups slide past each other, one over, one under
        const [a, b] = swaps[done], k = (ms - done * swapMs) / swapMs, ca = cupAt[a], cb = cupAt[b];
        pos[ca] = a + (b - a) * k; pos[cb] = b + (a - b) * k; lifts[ca] = -Math.sin(k * Math.PI) * 18; lifts[cb] = Math.sin(k * Math.PI) * 8;
      }
      E.cups.forEach((c, cup) => { c.style.left = slotX(pos[cup] / 3); c.style.transform = `translateY(${lifts[cup]}px)`; c.dataset.slot = cupAt.indexOf(cup); });
      // the pea shows under its cup for the first moment of the shuffle, and again when the cups lift at the end
      if (ms < 250 && E.stage === 'shuffle') { peaSlot = pea; lift = pea; }
      if (E.result) { peaSlot = E.result.pea; }
      // a guess button is a SLOT: the cup standing in that slot now
      if (E.stage === 'guess') E.cups.forEach(c => { if (c.dataset.ev != null) c.dataset.ev = c.dataset.slot; });
      if (E.result) E.cups.forEach(c => { const s = +c.dataset.slot; c.classList.toggle('right', s === E.result.pea); c.classList.toggle('wrong', s === E.result.guess && !E.result.right); });
      E.cups.forEach(c => c.classList.toggle('up', !!E.result || (lift >= 0 && +c.dataset.slot === lift)));
    } else E.cups.forEach((c, cup) => { c.style.left = slotX(cup / 3); c.dataset.slot = cup; });
    if (E.pea) { E.pea.hidden = peaSlot == null; if (peaSlot != null) E.pea.style.left = `calc(${slotX(peaSlot / 3)} + 16.66%)`; }
  }
  return { el, onEvent, clear, get active() { return !!E; }, get kind() { return E?.kind || null; }, get pids() { return E?.pids || []; }, get done() { return !!E?.result; } };
}

const DUCK = `<svg viewBox="0 0 64 56" class="duck-svg" aria-hidden="true"><ellipse cx="30" cy="38" rx="24" ry="14" fill="currentColor" stroke="#12222a" stroke-width="3"/><circle cx="44" cy="20" r="12" fill="currentColor" stroke="#12222a" stroke-width="3"/><path d="M54 20 l9 3 -9 4z" fill="#ff8a1a" stroke="#12222a" stroke-width="2"/><circle cx="47" cy="17" r="2.6" fill="#12222a"/></svg>`;
