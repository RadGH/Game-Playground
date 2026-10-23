// MUMMY WRAP on a screen. A phone that plays: a big ring with a smiling mummy spinning in the middle, the loose end of
// its bandage running round the ring, and the glowing gap (a dashed green arc with a brighter middle for PERFECT);
// one huge WRAP button (or tap the ring, or Space). The phone judges the tap at once by the same rules the server uses
// (sim.js createSpinner) and shows PERFECT / GOOD / SLIPPED; the server judges it again from the time the phone sends.
// The mummy gets a new bandage stripe for every wrap (then a bow, then a crown). A watch-only screen (TV) shows every
// player's ring and mummy side by side, all spinning, with their wrap counts.
import { chip } from '../../client/gamehud.js';
import { createSpinner, angleAt, LEVEL } from './sim.js';

const C = 100, R = 82;
const pt = (a, r) => { const rad = a * Math.PI / 180; return [(C + r * Math.sin(rad)).toFixed(1), (C - r * Math.cos(rad)).toFixed(1)]; };
const arc = (a0, a1, r) => { const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r); return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
const STRIPES = 16;
function mummy() {
  const stripes = Array.from({ length: STRIPES }, (_, i) => { const y = 64 + i * 5.4, tilt = i % 2 ? 3 : -3; return `<path class="mw-s" data-i="${i}" d="M66 ${y + tilt} Q100 ${y - 4} 134 ${y - tilt}" />`; }).join('');
  return `<g class="mw-mummy"><rect x="70" y="56" width="60" height="94" rx="26" fill="#cdb894" stroke="#0d2228" stroke-width="4"/>
    <g fill="none" stroke="#e6d8b8" stroke-width="2.5" stroke-linecap="round"><path d="M72 70 L128 78 M72 92 L128 84 M72 112 L128 120 M72 134 L128 126"/></g>
    <g class="mw-stripes" fill="none" stroke="#fffaf0" stroke-width="6" stroke-linecap="round">${stripes}</g>
    <rect x="70" y="56" width="60" height="94" rx="26" fill="none" stroke="#0d2228" stroke-width="4"/>
    <ellipse cx="88" cy="82" rx="9" ry="10" fill="#fff" stroke="#0d2228" stroke-width="3"/><ellipse cx="112" cy="82" rx="9" ry="10" fill="#fff" stroke="#0d2228" stroke-width="3"/>
    <circle class="mw-eye" cx="90" cy="84" r="4.5" fill="#0d2228"/><circle class="mw-eye" cx="114" cy="84" r="4.5" fill="#0d2228"/>
    <path d="M92 98 Q100 104 108 98" fill="none" stroke="#0d2228" stroke-width="3" stroke-linecap="round"/><circle cx="82" cy="96" r="4" fill="#ff9a9a" opacity=".6"/><circle cx="118" cy="96" r="4" fill="#ff9a9a" opacity=".6"/>
    <path class="mw-bow" d="M88 56 L76 46 L78 62 Z M112 56 L124 46 L122 62 Z" fill="#ff7ad1" stroke="#0d2228" stroke-width="3"/>
    <path class="mw-crown" d="M84 54 L86 38 L94 48 L100 34 L106 48 L114 38 L116 54 Z" fill="#ffd23f" stroke="#0d2228" stroke-width="3"/></g>`;
}
function ring() {
  return `<svg class="mw-ring" viewBox="0 0 200 200" aria-hidden="true"><circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#2c1d48" stroke-width="18"/>
    <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="#6a4f98" stroke-width="12" stroke-dasharray="2 10"/>
    <path class="mw-gap" fill="none" stroke="#7dff5a" stroke-width="18" stroke-dasharray="6 3"/><path class="mw-perf" fill="none" stroke="#fffb8a" stroke-width="18"/>
    <g class="mw-spin">${mummy()}</g>
    <g class="mw-hand"><path d="M${C} ${C - 30} L${C} ${C - R + 6}" stroke="#fffaf0" stroke-width="9" stroke-dasharray="10 3"/><rect x="${C - 9}" y="${C - R - 9}" width="18" height="18" rx="4" fill="#fffaf0" stroke="#0d2228" stroke-width="3"/></g></svg>`;
}

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, L = LEVEL[init.diff];
  ui.innerHTML = `
    <div class="mw-top"><span class="mw-title">Mummy Wrap</span><span class="clock"><b>--</b></span></div>
    <div class="mw-players">${players.map(p => chip(p, '<em class="sc">0</em>')).join('')}</div>
    <div class="mw-play"><div class="mw-stage" data-pid="${me}">${ring()}<b class="mw-say"></b></div><b class="mw-count">0 <small>wraps</small></b><button class="mw-btn big-btn">WRAP!</button></div>
    <div class="mw-row">${players.map(p => `<div class="mw-cell" data-pid="${p.pid}" style="--seat:${p.color}">${chip(p)}<div class="mw-stage">${ring()}<b class="mw-say"></b></div><b class="mw-n">0</b></div>`).join('')}</div>
    <div class="mw-big"></div>
    <p class="mw-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.mw-players [data-pid="${me}"]`)?.classList.add('me');
  const stages = new Map();          // pid -> { el, gap, k, wraps } (mine is in .mw-play, the others' in .mw-row)
  for (const p of players) stages.set(p.pid, { el: ui.querySelector(`.mw-cell[data-pid="${p.pid}"] .mw-stage`), gap: init.offsets[0], k: 0, wraps: 0, drawnGap: null, drawnW: -1 });
  const mine = me != null ? { el: $('.mw-play .mw-stage'), gap: init.offsets[0], k: 0, wraps: 0, drawnGap: null, drawnW: -1 } : null;
  const S = createSpinner(L, init.offsets);
  let phase = '', t0 = 0, lastTap = -9;
  const songT = () => performance.now() / 1000 - t0;

  function drawGap(st, gap) {
    if (st.drawnGap === gap) return; st.drawnGap = gap;
    st.el.querySelector('.mw-gap').setAttribute('d', arc(gap - L.half, gap + L.half, R));
    st.el.querySelector('.mw-perf').setAttribute('d', arc(gap - L.half * 0.4, gap + L.half * 0.4, R));
  }
  function drawWraps(st, w) {
    if (st.drawnW === w) return; st.drawnW = w;
    st.el.querySelectorAll('.mw-s').forEach((s, i) => s.classList.toggle('on', i < w));
    st.el.classList.toggle('bow', w > STRIPES); st.el.classList.toggle('crown', w > STRIPES * 2);
  }
  function say(st, q) { const s = st.el.querySelector('.mw-say'); s.textContent = q === 2 ? 'PERFECT!' : q === 1 ? 'Good!' : 'Slipped!'; s.className = 'mw-say q' + q; void s.offsetWidth; s.classList.add('go'); }
  function tap() {
    if (watching || phase !== 'play' || !mine) return;
    const t = songT(); if (t < 0 || t > init.play) return;
    const q = S.tap(t); if (q == null) { ctx.sfx('tap'); return; }
    lastTap = t; ctx.send('tap', { t: Math.round(t * 1000) / 1000 });
    say(mine, q); ctx.sfx(q === 2 ? 'coins' : q ? 'good' : 'bad');
    mine.el.classList.remove('hit', 'slip'); void mine.el.offsetWidth; mine.el.classList.add(q ? 'hit' : 'slip');
    $('.mw-count').firstChild.textContent = S.wraps + ' ';
  }
  ui.addEventListener('pointerdown', e => { if (e.target.closest('.mw-btn, .mw-play .mw-stage')) { e.preventDefault(); tap(); } });
  const onKey = e => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); tap(); } };
  addEventListener('keydown', onKey);
  function note(g) {
    if (g.phase === 'ready') return 'Tap WRAP when the bandage is in the green gap!';
    if (g.phase === 'end') {
      if (init.solo) { const s = g.scores[players[0].pid], m = init.medals; return s >= m[2] ? `GOLD mummy! ${s} wraps.` : s >= m[1] ? `SILVER mummy! ${s} wraps.` : s >= m[0] ? `BRONZE mummy! ${s} wraps.` : `${s} wraps. Bronze at ${m[0]}!`; }
      return 'All wrapped up! Most wraps wins.';
    }
    if (watching) return 'Wrap those mummies!';
    return init.solo ? `Bronze ${init.medals[0]} · Silver ${init.medals[1]} · Gold ${init.medals[2]} wraps` : 'Middle of the gap = PERFECT!';
  }
  return {
    state(g) {
      if (g.phase !== phase) {
        if (g.phase === 'play') { t0 = performance.now() / 1000 - (phase === '' ? Math.max(0, init.play - g.left) : 0); ctx.sfx('open'); }
        if (g.phase === 'end') ctx.sfx('win');
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.phase === 'play' && g.left <= 5);
      for (const p of players) {
        ui.querySelector(`.mw-players [data-pid="${p.pid}"] .sc`).textContent = g.scores[p.pid];
        const st = stages.get(p.pid); st.gap = g.gap[p.pid]; st.wraps = g.scores[p.pid];
        ui.querySelector(`.mw-cell[data-pid="${p.pid}"] .mw-n`).textContent = `${g.scores[p.pid]} wraps`;
      }
      if (mine && g.phase === 'play' && (g.k[me] !== S.k || g.scores[me] !== S.wraps) && songT() - lastTap > 1.5) {
        S.k = g.k[me]; S.gap = g.gap[me]; S.wraps = g.scores[me]; $('.mw-count').firstChild.textContent = S.wraps + ' ';   // the server never saw a tap: take its word
      }
      if (g.phase === 'end') {
        const order = [...players].sort((a, b) => g.scores[b.pid] - g.scores[a.pid]);
        $('.mw-big').innerHTML = order.map((p, i) => { const [pf, gd, ms] = g.stats[p.pid]; return `<div class="mw-final" style="--seat:${p.color}">${chip(p)}<b>${g.scores[p.pid]}</b><small>${pf} perfect · ${gd} good · ${ms} slips</small>${i === 0 && g.scores[p.pid] > 0 && !init.solo ? '<em>Best wrapped!</em>' : ''}</div>`; }).join('');
      }
      $('.mw-note').textContent = note(g);
    },
    event(ev) {
      if (ev.e !== 'tap') return;
      const st = stages.get(ev.pid); if (!st) return;
      say(st, ev.q); st.el.classList.remove('hit', 'slip'); void st.el.offsetWidth; st.el.classList.add(ev.q ? 'hit' : 'slip');
      if (watching && ev.q === 2) ctx.sfx('tap');
    },
    frame() {
      const a = phase === 'play' ? angleAt(Math.max(0, songT()), L) : 0;
      const spin = `rotate(${(a % 360).toFixed(1)} ${C} ${C})`;
      const list = mine ? [[mine, S.gap, S.wraps]] : [];
      if (watching) for (const st of stages.values()) list.push([st, st.gap, st.wraps]);
      for (const [st, gap, w] of list) {
        st.el.querySelector('.mw-hand').setAttribute('transform', spin);
        st.el.querySelector('.mw-spin').setAttribute('transform', `rotate(${(12 * Math.sin(a * Math.PI / 180)).toFixed(1)} ${C} ${C + 50})`);
        drawGap(st, phase === 'play' ? gap : -999); drawWraps(st, w);
      }
    },
    dispose() { removeEventListener('keydown', onKey); },
  };
}
