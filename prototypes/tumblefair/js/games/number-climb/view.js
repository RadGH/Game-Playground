// NUMBER CLIMB on a screen. A phone that plays gets the round's grid as big number tiles and a "Find 7" sign; a right
// tap fills the tile in your colour at once (the phone knows the grid; the server checks it again), a wrong one shakes
// it and freezes the grid for a moment. Everyone's climb shows as a bar per player ("12 / 25") with their face, so you
// can see who is ahead. A watch-only screen (TV) shows the grid big with each player's face badge sitting on the
// number they need next, plus the bars.
import { chip } from '../../client/gamehud.js';
import { makeRng } from '../../shared/rng.js';
import { SIDES } from './sim.js';

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  const seat = me != null ? players.find(p => p.pid === me) : null;
  ui.innerHTML = `
    <div class="nc-top"><span class="nc-title">Number Climb</span><span class="nc-round"></span><span class="clock"><b>--</b></span></div>
    <div class="nc-bars">${players.map(p => `<div class="nc-barrow" data-pid="${p.pid}" style="--seat:${p.color}">${chip(p)}<div class="nc-bar"><u></u></div><b class="nc-of"></b><em class="sc">0</em></div>`).join('')}</div>
    <div class="nc-find"><span>Find</span><b>1</b></div>
    <div class="nc-board"></div>
    <div class="nc-sum"></div>
    <p class="nc-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (seat) { ui.style.setProperty('--mine', seat.color); ui.querySelector(`.nc-barrow[data-pid="${me}"]`)?.classList.add('me'); }
  let phase = '', round = -1, grid = null, N = 0, mine = 1, lockT = 0, lastSend = 0;
  const now = () => performance.now() / 1000;

  function build(g) {
    grid = g.grid; N = g.n * g.n; mine = g.next?.[me] ?? 1;
    const hard = init.diff === 'hard', r = makeRng(g.look);
    $('.nc-board').innerHTML = `<div class="nc-grid" style="--n:${g.n}">${grid.map(v => {
      const st = hard ? `style="--rot:${r.int(-35, 35)}deg;--sz:${r.range(0.7, 1.15).toFixed(2)}"` : '';
      return `<button class="nc-tile" data-v="${v}" ${st} aria-label="${v}"><b>${v}</b><i class="nc-badges"></i></button>`;
    }).join('')}</div>`;
    paintMine();
  }
  function paintMine() {
    ui.querySelectorAll('.nc-tile').forEach(t => t.classList.toggle('done', !watching && +t.dataset.v < mine));
    $('.nc-find b').textContent = mine > N ? '✓' : mine;
    ui.classList.toggle('finished', mine > N);
  }
  ui.addEventListener('pointerdown', e => {
    const b = e.target.closest('.nc-tile'); if (!b || watching || phase !== 'climb' || mine > N) return;
    e.preventDefault();
    const v = +b.dataset.v;
    if (now() < lockT) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
    if (v < mine) return;
    ctx.send('tap', { r: round, n: v }); lastSend = now();
    if (v === mine) { mine++; b.classList.add('pop'); ctx.sfx(mine > N ? 'win' : 'tap'); paintMine(); }
    else { lockT = now() + init.wrong; ctx.sfx('bad'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake', 'wrong'); ui.classList.add('frozen'); setTimeout(() => b.classList.remove('wrong'), init.wrong * 1000); }
  });
  function badges(g) {
    ui.querySelectorAll('.nc-badges').forEach(b => { b.innerHTML = ''; });
    for (const p of players) {
      const n = g.next[p.pid]; if (n > N) continue;
      const b = ui.querySelector(`.nc-tile[data-v="${n}"] .nc-badges`);
      if (b) b.insertAdjacentHTML('beforeend', `<i class="nc-face" style="--seat:${p.color}">${p.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i>`);
    }
  }
  function note(g) {
    if (g.phase === 'ready') return 'Tap 1, 2, 3… in order!';
    if (g.phase === 'between') { const s = SIDES[init.diff][g.round + 1]; return `Next: a ${s}×${s} grid. Get ready!`; }
    if (g.phase === 'end') {
      if (init.solo) { const s = g.scores[players[0].pid], m = init.medals; return s >= m[2] ? `GOLD! ${s} points.` : s >= m[1] ? `SILVER! ${s} points.` : s >= m[0] ? `BRONZE! ${s} points.` : `${s} points. Bronze at ${m[0]}!`; }
      return 'All climbed! Most points wins.';
    }
    if (watching) return 'The faces show the number each player needs next.';
    if (mine > N) return g.done.length < players.length ? 'Done! Waiting for the others…' : 'Done!';
    return 'Tap the next number!';
  }
  return {
    state(g) {
      if (g.round !== round && g.grid) { round = g.round; build(g); }
      if (g.phase !== phase) {
        if (g.phase === 'climb') { mine = Math.max(1, g.next[me] ?? 1); paintMine(); ctx.sfx('open'); }
        if (g.phase === 'end') ctx.sfx('win');
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.phase === 'climb' && g.left <= 4);
      $('.nc-round').textContent = g.phase === 'end' ? 'Final scores' : `Round ${Math.max(0, g.round) + 1} of ${init.rounds}`;
      if (g.next && me != null && g.phase === 'climb') {
        const s = g.next[me];
        if (s > mine) { mine = s; paintMine(); }
        else if (s < mine && now() - lastSend > 2) { mine = s; paintMine(); }
      }
      if (g.next) {
        for (const p of players) {
          const row = ui.querySelector(`.nc-barrow[data-pid="${p.pid}"]`), got = Math.min(N, g.next[p.pid] - 1);
          row.querySelector('.nc-bar u').style.width = (got / N * 100) + '%';
          const pl = g.done.indexOf(p.pid);
          row.querySelector('.nc-of').textContent = pl >= 0 ? (init.solo ? 'done!' : ['1st!', '2nd', '3rd', '4th'][pl]) : `${got} / ${N}`;
          row.classList.toggle('fin', pl >= 0); row.classList.toggle('lock', g.lock.includes(p.pid));
        }
        if (watching) badges(g);
      }
      for (const p of players) ui.querySelector(`.nc-barrow[data-pid="${p.pid}"] .sc`).textContent = g.scores[p.pid];
      $('.nc-sum').innerHTML = g.gained ? players.map(p => `<span style="--seat:${p.color}">${chip(p)}<b>+${g.gained[p.pid]}</b></span>`).join('') : '';
      $('.nc-note').textContent = note(g);
    },
    event(ev) {
      if (ev.e === 'done' && ev.pid !== me) ctx.sfx('pick');
      const row = ui.querySelector(`.nc-barrow[data-pid="${ev.pid}"]`); if (!row || ev.e !== 'miss') return;
      row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake');
    },
    frame() {
      if (!ui.classList.contains('frozen')) return;
      if (now() >= lockT) ui.classList.remove('frozen');
    },
    dispose() {},
  };
}
