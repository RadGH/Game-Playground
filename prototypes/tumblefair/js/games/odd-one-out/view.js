// ODD ONE OUT on a screen. A phone that plays gets one big square grid of pictures; tapping the odd one swaps in the
// next grid AT ONCE (the phone knows the puzzle list and checks the tap itself; the server checks it again and keeps
// the score). A wrong tap shakes the cell and greys the grid for a second with a countdown. Everyone's score and how
// many grids they have cleared sit in the chips above.
// A watch-only screen (TV) shows a lane per player: their face, a progress bar, and a small copy of the grid they are
// on right now, which flashes when they find the odd one and shakes when they miss.
import { chip } from '../../client/gamehud.js';
import { ICONS } from './icons.js';
import { pointsFor } from './sim.js';

export const PALETTE = ['#e8485a', '#2f7de1', '#1f9d55', '#8a4fd8', '#e0700f', '#0f8f98', '#d6408f', '#6b7a2f'];
const symId = key => 'oo-' + key.replace(/[^a-z0-9]/g, '-');
/** Inline <symbol>s for every picture, once per page. */
function symbols() {
  return `<svg class="oo-defs" width="0" height="0" aria-hidden="true">${Object.entries(ICONS).map(([k, [w, h, d]]) => `<symbol id="${symId(k)}" viewBox="0 0 ${w} ${h}"><path d="${d}"/></symbol>`).join('')}</svg>`;
}
/** One cell's picture. */
function cellPic(P, i) {
  const odd = i === P.o, key = odd && P.x ? P.x : P.b;
  let tf = '';
  if (odd && P.k === 'turn') tf = `rotate(${P.v * P.r}deg)`;
  if (odd && P.k === 'small') tf = `scale(${P.v})`;
  if (odd && P.k === 'flip') tf = 'scaleX(-1)';
  return `<svg class="oo-pic" viewBox="0 0 10 10" ${tf ? `style="transform:${tf}"` : ''} aria-hidden="true"><use href="#${symId(key)}" x="0.6" y="0.6" width="8.8" height="8.8"/></svg>`;
}
export function gridHtml(P, cls = '') {
  if (!P) return '';
  return `<div class="oo-grid ${cls}" style="--n:${P.n};color:${PALETTE[P.c % PALETTE.length]}">${Array.from({ length: P.n * P.n }, (_, i) => `<button class="oo-cell" data-i="${i}" aria-label="Picture ${i + 1}">${cellPic(P, i)}</button>`).join('')}</div>`;
}

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, P = init.puzzles;
  ui.innerHTML = `${symbols()}
    <div class="oo-top"><span class="oo-title">Odd One Out</span><span class="clock"><b>--</b></span></div>
    <div class="oo-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="oo-st"></strong>')).join('')}</div>
    <div class="oo-play">
      <div class="oo-info"><b class="oo-num"></b><span class="oo-worth"></span></div>
      <div class="oo-board"></div>
      <div class="oo-freeze" aria-live="polite"><b>Oops!</b><span></span></div>
    </div>
    <div class="oo-lanes">${players.map(p => `<div class="oo-lane" data-pid="${p.pid}" style="--seat:${p.color}">${chip(p)}<div class="oo-bar"><u></u></div><b class="oo-n">0</b><div class="oo-mini"></div></div>`).join('')}</div>
    <div class="oo-big"></div>
    <p class="oo-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.oo-players [data-pid="${me}"]`)?.classList.add('me');
  let phase = '', mine = 0, lockT = 0, lastG = null, lastSend = 0, laneAt = {};

  function drawMine() {
    const Q = P[mine]; if (!Q) return;
    $('.oo-board').innerHTML = gridHtml(Q);
    $('.oo-num').textContent = `Grid ${mine + 1}`;
    $('.oo-worth').textContent = `${Q.n}×${Q.n} · worth ${pointsFor(Q.n)}`;
  }
  function drawLane(pid, k) {
    if (laneAt[pid] === k) return; laneAt[pid] = k;
    const lane = ui.querySelector(`.oo-lane[data-pid="${pid}"] .oo-mini`); if (lane) lane.innerHTML = gridHtml(P[k], 'mini');
  }
  ui.addEventListener('pointerdown', e => {
    const b = e.target.closest('.oo-board .oo-cell'); if (!b || watching || phase !== 'play') return;
    e.preventDefault();
    const now = performance.now() / 1000, Q = P[mine], i = +b.dataset.i;
    if (!Q) return;
    if (now < lockT) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
    ctx.send('tap', { k: mine, i }); lastSend = now;
    if (i === Q.o) {
      b.classList.add('right'); ctx.sfx('good');
      const pts = pointsFor(Q.n); pop(`+${pts}`);
      mine++; setTimeout(drawMine, 120);
    } else {
      ctx.sfx('bad'); b.classList.add('wrong', 'shake'); lockT = now + init.wrong;
      ui.classList.add('frozen');
    }
  });
  function pop(text) { const e = document.createElement('i'); e.className = 'oo-pop'; e.textContent = text; $('.oo-play').append(e); setTimeout(() => e.remove(), 800); }
  function note(g) {
    if (g.phase === 'ready') return watching ? 'Find the one picture that is different!' : 'Get ready… find the one that is different!';
    if (g.phase === 'end') {
      if (init.solo) { const s = g.scores[players[0].pid], m = init.medals, got = s >= m[2] ? 'GOLD' : s >= m[1] ? 'SILVER' : s >= m[0] ? 'BRONZE' : ''; return got ? `${got}! ${s} points.` : `${s} points. Bronze at ${m[0]}!`; }
      return 'Time! Most points wins.';
    }
    if (watching) return 'Who can spot them fastest?';
    return init.solo ? `Score attack! Bronze ${init.medals[0]} · Silver ${init.medals[1]} · Gold ${init.medals[2]}` : 'Tap the odd one out!';
  }
  return {
    state(g) {
      lastG = g;
      if (g.phase !== phase) {
        if (g.phase === 'play') { mine = Math.max(mine, g.at[me] ?? 0); drawMine(); ctx.sfx('open'); }
        if (g.phase === 'end') { ctx.sfx('win'); ui.classList.remove('frozen'); }
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.phase === 'play' && g.left <= 5);
      if (me != null && g.phase === 'play') {
        const s = g.at[me];
        if (s > mine) { mine = s; drawMine(); }
        else if (s < mine && performance.now() / 1000 - lastSend > 2) { mine = s; drawMine(); }   // the server never saw a tap: go back to where it is
      }
      const best = Math.max(1, ...Object.values(g.at));
      for (const p of players) {
        const c = ui.querySelector(`.oo-players [data-pid="${p.pid}"]`);
        c.querySelector('.sc').textContent = g.scores[p.pid];
        c.querySelector('.oo-st').textContent = g.lock.includes(p.pid) ? 'frozen!' : g.at[p.pid] ? `${g.at[p.pid]} found` : '';
        c.classList.toggle('lock', g.lock.includes(p.pid));
        const lane = ui.querySelector(`.oo-lane[data-pid="${p.pid}"]`);
        lane.querySelector('.oo-n').textContent = `${g.scores[p.pid]} pts · ${g.at[p.pid]} found`;
        lane.querySelector('.oo-bar u').style.width = (g.at[p.pid] / best * 100) + '%';
        lane.classList.toggle('lock', g.lock.includes(p.pid));
        if (watching && g.phase === 'play') drawLane(p.pid, g.at[p.pid]);
      }
      if (g.phase === 'end') {
        const order = [...players].sort((a, b) => g.scores[b.pid] - g.scores[a.pid]);
        $('.oo-big').innerHTML = order.map((p, i) => `<div class="oo-final" style="--seat:${p.color}">${chip(p)}<b>${g.scores[p.pid]}</b><small>${g.at[p.pid]} grids</small>${i === 0 && g.scores[p.pid] > 0 && !init.solo ? '<em>Winner!</em>' : ''}</div>`).join('');
      }
      $('.oo-note').textContent = note(g);
    },
    event(ev) {
      if (!watching && ev.pid === me) return;
      const lane = ui.querySelector(`.oo-lane[data-pid="${ev.pid}"]`); if (!lane) return;
      const cls = ev.e === 'found' ? 'flash' : 'shake';
      lane.classList.remove(cls); void lane.offsetWidth; lane.classList.add(cls);
      if (watching && ev.e === 'found') { drawLane(ev.pid, ev.k + 1); ctx.sfx('tap'); }
    },
    frame() {
      if (!ui.classList.contains('frozen')) return;
      const r = lockT - performance.now() / 1000;
      if (r <= 0) { ui.classList.remove('frozen'); ui.querySelectorAll('.oo-cell.wrong').forEach(b => b.classList.remove('wrong')); return; }
      $('.oo-freeze span').textContent = `wait ${r.toFixed(1)}`;
    },
    dispose() {},
  };
}
