// CROW COUNT on a screen. A cornfield under a big sky with a smiling scarecrow; the round's script (from the server)
// is played on every screen by its own clock: crows flap in from the sides and land, others take off and leave, some
// pass straight over. Then the field is covered ("No peeking!") and a phone gets a big number with - / + and OK
// (every press is sent as a draft, so a number never OK'd still counts). The reveal uncovers the field and numbers the
// crows that are left one by one, then shows every guess with its points.
// A watch-only screen (TV) shows the field big and, while people guess, who has locked in.
import { esc, chip } from '../../client/gamehud.js';
import { PASS } from './sim.js';

const CROW = `<svg viewBox="0 0 60 44" aria-hidden="true"><g class="cc-wing-b"><path d="M26 18 Q14 2 4 6 Q12 14 22 22 Z" fill="#2b2f3a"/></g>
  <ellipse cx="28" cy="26" rx="16" ry="11" fill="#20242e"/><path d="M14 24 L2 20 L6 30 Z" fill="#20242e"/>
  <circle cx="42" cy="17" r="9" fill="#20242e"/><path d="M49 16 L59 19 L49 22 Z" fill="#ffb02e" stroke="#7a4a00" stroke-width="1"/>
  <circle cx="44" cy="15" r="3.6" fill="#fff"/><circle cx="45" cy="15" r="1.8" fill="#111"/><circle cx="45.6" cy="14.2" r=".6" fill="#fff"/>
  <path d="M24 36 v6 M32 36 v6" stroke="#ffb02e" stroke-width="2.4" stroke-linecap="round"/>
  <g class="cc-wing"><path d="M30 22 Q22 4 8 8 Q16 20 30 28 Z" fill="#3a404e"/></g></svg>`;
const SCARECROW = `<svg viewBox="0 0 100 120" aria-hidden="true"><path d="M50 40 V118" stroke="#8a5a2b" stroke-width="6"/><path d="M14 56 H86" stroke="#8a5a2b" stroke-width="6"/>
  <path d="M30 50 H70 L74 84 H26 Z" fill="#4d8fd6" stroke="#0d2228" stroke-width="3"/><path d="M38 60 h8 v8 h-8z M54 70 h8 v8 h-8z" fill="#ffd23f" stroke="#0d2228" stroke-width="2"/>
  <path d="M14 52 l-8 4 8 4 M86 52 l8 4 -8 4" fill="#f2c94c" stroke="#0d2228" stroke-width="2"/>
  <circle cx="50" cy="32" r="15" fill="#f6d9a0" stroke="#0d2228" stroke-width="3"/><circle cx="44" cy="30" r="2.4" fill="#0d2228"/><circle cx="56" cy="30" r="2.4" fill="#0d2228"/>
  <path d="M43 37 Q50 43 57 37" fill="none" stroke="#0d2228" stroke-width="2.4" stroke-linecap="round"/><circle cx="40" cy="36" r="3" fill="#ff9a9a" opacity=".7"/><circle cx="60" cy="36" r="3" fill="#ff9a9a" opacity=".7"/>
  <path d="M28 22 Q50 4 72 22 Z" fill="#c98a3a" stroke="#0d2228" stroke-width="3"/><path d="M22 22 H78" stroke="#0d2228" stroke-width="4" stroke-linecap="round"/></svg>`;

/** Turn a round's script into crows: { s, tIn, tOut, sideIn, sideOut } (tIn null = there from the start) + passes. */
export function lives(script) {
  const L = script.start.map(s => ({ s, tIn: null, tOut: null, sideIn: 1, sideOut: 1 })), passes = [];
  for (const [t, k, s, side] of script.ev) {
    if (k === 'p') passes.push({ y: s, t, side });
    else if (k === 'i') L.push({ s, tIn: t, tOut: null, sideIn: side, sideOut: 1 });
    else { const c = L.filter(c => c.s === s && c.tOut == null && (c.tIn == null || c.tIn <= t)).pop(); if (c) { c.tOut = t; c.sideOut = side; } }
  }
  return { L, passes };
}
const lerp = (a, b, f) => a + (b - a) * f, ease = f => f * f * (3 - 2 * f);

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  ui.innerHTML = `
    <div class="cc-top"><span class="cc-title">Crow Count</span><span class="cc-round"></span><span class="clock"><b>--</b></span></div>
    <div class="cc-field"><div class="cc-sky"><i class="cc-sun"></i><i class="cc-cloud a"></i><i class="cc-cloud b"></i></div><div class="cc-ground"></div>
      <div class="cc-scare">${SCARECROW}</div><div class="cc-birds"></div>
      <div class="cc-cover"><b>No peeking!</b><span>How many crows are left?</span></div><div class="cc-total"><b></b><span>crows left</span></div></div>
    <div class="cc-pad"><p class="cc-ask">How many crows are <b>left in the field</b>?</p>
      <div class="cc-row"><button class="cc-pm" data-d="-1" aria-label="One fewer">−</button><strong class="cc-n">?</strong><button class="cc-pm" data-d="1" aria-label="One more">+</button></div>
      <button class="cc-ok big-btn">OK</button></div>
    <div class="cc-guesses"></div>
    <div class="cc-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="cc-st"></strong>')).join('')}</div>
    <p class="cc-note"></p>`;
  const $ = s => ui.querySelector(s), birds = $('.cc-birds');
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.cc-players [data-pid="${me}"]`)?.classList.add('me');
  let phase = '', round = -1, script = null, crows = [], t0 = 0, guess = null, ok = false, revealAt = 0;

  function build(sc) {
    script = sc; birds.innerHTML = ''; crows = [];
    const { L, passes } = lives(sc);
    for (const c of L) crows.push({ ...c, el: add() });
    for (const p of passes) crows.push({ pass: p, el: add() });
  }
  function add() { const el = document.createElement('i'); el.className = 'cc-crow'; el.innerHTML = CROW + '<b class="cc-tag"></b>'; birds.append(el); return el; }
  /** Draw every crow at script time T. */
  function draw(T) {
    if (!script) return;
    const F = script.fly;
    for (const c of crows) {
      let x, y, fly = false, show = true, face = 1;
      if (c.pass) {
        const f = (T - c.pass.t) / (F * PASS); if (f < 0 || f > 1) show = false;
        x = c.pass.side > 0 ? lerp(-10, 110, f) : lerp(110, -10, f); y = c.pass.y + Math.sin(f * 9) * 2; fly = true; face = c.pass.side;
      } else {
        const [sx, sy] = script.spots[c.s];
        x = sx; y = sy;
        if (c.tIn != null && T < c.tIn) show = false;
        else if (c.tIn != null && T < c.tIn + F) { const f = ease((T - c.tIn) / F), ox = c.sideIn > 0 ? -10 : 110; x = lerp(ox, sx, f); y = lerp(8, sy, f) - Math.sin(f * Math.PI) * 10; fly = true; face = sx > ox ? 1 : -1; }
        if (c.tOut != null && T >= c.tOut) { const f = ease(Math.min(1, (T - c.tOut) / F)), ox = c.sideOut > 0 ? 110 : -10; x = lerp(sx, ox, f); y = lerp(sy, -6, f); fly = true; face = ox > sx ? 1 : -1; if (f >= 1) show = false; }
      }
      c.el.style.display = show ? '' : 'none'; if (!show) continue;
      const sc = 0.65 + y / 100 * 0.6;
      c.el.style.left = x + '%'; c.el.style.top = y + '%'; c.el.style.zIndex = Math.round(y);
      c.el.style.transform = `translate(-50%, -80%) scale(${(face < 0 ? -sc : sc).toFixed(3)}, ${sc.toFixed(3)})`;
      c.el.classList.toggle('fly', fly);
    }
  }
  const leftAt = () => crows.filter(c => !c.pass && c.tOut == null);
  function paintPad() {
    $('.cc-n').textContent = guess == null ? '?' : guess;
    $('.cc-ok').textContent = ok ? 'Locked in!' : 'OK';
    $('.cc-ok').classList.toggle('on', ok); $('.cc-ok').disabled = guess == null;
    ui.querySelectorAll('.cc-pm').forEach(b => { b.disabled = (+b.dataset.d < 0 && (guess ?? 0) <= 0) || (+b.dataset.d > 0 && (guess ?? 0) >= init.max); });
  }
  function sendGuess(lock) { ok = lock; ctx.send('guess', { n: guess, ok }); paintPad(); }
  ui.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || watching || phase !== 'guess') return;
    if (b.classList.contains('cc-pm')) { guess = Math.max(0, Math.min(init.max, (guess ?? 0) + +b.dataset.d)); ctx.sfx('tap'); sendGuess(false); }
    else if (b.classList.contains('cc-ok') && guess != null) { ctx.sfx(ok ? 'tap' : 'good'); sendGuess(!ok); }
  });
  function paintReveal(r) {
    $('.cc-guesses').innerHTML = players.map(p => {
      const gu = r.guesses[p.pid], off = r.off[p.pid];
      const word = gu == null ? 'no guess' : off === 0 ? 'Spot on!' : off === 1 ? 'One off' : off === 2 ? 'Two off' : 'Too far';
      return `<div class="cc-g${off === 0 ? ' exact' : ''}${r.closest.includes(p.pid) ? ' best' : ''}" style="--seat:${p.color}"><i class="cc-face">${p.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i><b>${gu ?? '–'}</b><span>${esc(word)}</span><em>+${r.gain[p.pid]}</em></div>`;
    }).join('');
  }
  function note(g) {
    if (g.phase === 'ready') return 'Watch the crows closely…';
    if (g.phase === 'watch') return 'Keep counting! Flyovers do not count.';
    if (g.phase === 'guess') return watching ? `${g.in.length} of ${players.length} locked in` : ok ? 'Locked in. You can still change it.' : 'Use − and +, then press OK.';
    if (g.phase === 'reveal') { const r = g.reveal; return `There ${r.n === 1 ? 'was' : 'were'} ${r.n} crow${r.n === 1 ? '' : 's'} left!`; }
    if (init.solo) { const s = g.scores[players[0].pid]; return `${s} of ${init.rounds * 5} points. ${s >= 17 ? 'Gold eyes!' : s >= 12 ? 'Silver eyes!' : s >= 7 ? 'Bronze eyes!' : 'Keep practising!'}`; }
    return 'All counted! Most points wins.';
  }
  return {
    priv(d) { if (phase === 'guess' && d.guess != null && guess == null) { guess = d.guess; ok = d.ok; paintPad(); } },
    state(g) {
      if (g.script && (g.round !== round || !script)) { round = g.round; build(g.script); }
      if (g.phase !== phase) {
        if (g.phase === 'watch') { t0 = performance.now() / 1000 - (phase === '' ? Math.max(0, g.script.W - g.left) : 0); ctx.sfx('open'); }
        if (g.phase === 'guess') { guess = null; ok = false; paintPad(); ctx.sfx('pick'); }
        if (g.phase === 'reveal') { draw(1e9); paintReveal(g.reveal); revealAt = performance.now(); leftAt().forEach(c => { c.el.querySelector('.cc-tag').textContent = ''; }); ctx.sfx('coins'); }
        if (g.phase === 'end') ctx.sfx('win');
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.phase === 'guess' && g.left <= 3);
      $('.cc-round').textContent = g.phase === 'end' ? 'Final scores' : `Round ${Math.max(0, g.round) + 1} of ${init.rounds}`;
      for (const p of players) {
        const c = ui.querySelector(`.cc-players [data-pid="${p.pid}"]`); c.querySelector('.sc').textContent = g.scores[p.pid];
        let t = '';
        if (g.phase === 'guess') t = g.in.includes(p.pid) ? 'locked in' : g.typing.includes(p.pid) ? 'counting…' : 'thinking…';
        if (g.phase === 'reveal') t = `+${g.reveal.gain[p.pid]}`;
        c.querySelector('.cc-st').textContent = t; c.classList.toggle('in', g.phase === 'guess' && g.in.includes(p.pid));
      }
      if (g.phase === 'reveal') { $('.cc-total b').textContent = g.reveal.n; }
      $('.cc-note').textContent = note(g);
    },
    frame() {
      if (phase === 'watch') draw(performance.now() / 1000 - t0);
      if (phase === 'reveal') {
        const k = Math.floor((performance.now() - revealAt) / 260), L = leftAt();
        L.forEach((c, i) => { const tag = c.el.querySelector('.cc-tag'); const s = i < k ? String(i + 1) : ''; if (tag.textContent !== s) { tag.textContent = s; if (s) ctx.sfx('tap'); } });
        ui.classList.toggle('counted', k >= L.length);
      }
    },
    dispose() {},
  };
}
