// SHAPE SORTER on a screen. A phone that plays gets a tall toy chute with a smiling toy dropping down it and the bins
// as big buttons under it (each bin shows its shape drawn in its colour AND pattern, with the words under it). The
// phone runs the toy clock itself: a tap sorts at once (the bin flashes green, or red with a shake), a toy that reaches
// the bottom is dropped. The combo and score sit on top; everyone's score and combo are in the chips.
// A watch-only screen (TV) shows a lane per player: their face, score, combo and the toy they are on right now,
// flashing green or red as they sort.
import { chip } from '../../client/gamehud.js';
import { worth } from './sim.js';

const HUE = { red: '#e8485a', blue: '#2f7de1', green: '#1f9d55' };
const PAT = { red: 'stripes', blue: 'dots', green: 'checks' };
const PATH = { circle: '<circle cx="50" cy="52" r="38"/>', square: '<rect x="14" y="16" width="72" height="72" rx="10"/>', triangle: '<path d="M50 10 L90 86 H10 Z" stroke-linejoin="round"/>' };
function defs() {
  return `<svg class="ss-defs" width="0" height="0" aria-hidden="true"><defs>
    <pattern id="ss-red" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" fill="${HUE.red}"/><rect width="5" height="14" fill="#fff" opacity=".55"/></pattern>
    <pattern id="ss-blue" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="${HUE.blue}"/><circle cx="7" cy="7" r="3" fill="#fff" opacity=".7"/></pattern>
    <pattern id="ss-green" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${HUE.green}"/><rect width="8" height="8" fill="#fff" opacity=".45"/><rect x="8" y="8" width="8" height="8" fill="#fff" opacity=".45"/></pattern></defs></svg>`;
}
/** A shape in its colour and pattern; `face` adds a toy's smile. */
export function shape([sh, col], face = false) {
  const f = face ? '<circle cx="40" cy="50" r="5" fill="#0d2228"/><circle cx="60" cy="50" r="5" fill="#0d2228"/><circle cx="41.5" cy="48.5" r="1.6" fill="#fff"/><circle cx="61.5" cy="48.5" r="1.6" fill="#fff"/><path d="M42 62 Q50 70 58 62" fill="none" stroke="#0d2228" stroke-width="4" stroke-linecap="round"/>' : '';
  const g = PATH[sh].replace('/>', ` fill="url(#ss-${col})" stroke="#0d2228" stroke-width="6"/>`);
  return `<svg viewBox="0 0 100 100" aria-hidden="true">${g}${f}</svg>`;
}
const words = ([sh, col]) => `${col} ${sh}`;

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, B = init.bins, T = init.toys;
  ui.innerHTML = `${defs()}
    <div class="ss-top"><span class="ss-title">Shape Sorter</span><span class="clock"><b>--</b></span></div>
    <div class="ss-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="ss-st"></strong>')).join('')}</div>
    <div class="ss-play">
      <div class="ss-chute"><div class="ss-toy"></div><div class="ss-floor"></div><div class="ss-combo"></div><div class="ss-flash"></div></div>
      <div class="ss-bins" data-n="${B.length}">${B.map((b, i) => `<button class="ss-bin" data-b="${i}" aria-label="${words(b)} bin">${shape(b)}<span>${words(b)}</span></button>`).join('')}</div>
    </div>
    <div class="ss-lanes">${players.map(p => `<div class="ss-lane" data-pid="${p.pid}" style="--seat:${p.color}">${chip(p)}<div class="ss-cur"></div><b class="ss-n">0</b><span class="ss-c"></span></div>`).join('')}</div>
    <div class="ss-big"></div>
    <p class="ss-note"></p>`;
  const $ = s => ui.querySelector(s), toyEl = $('.ss-toy');
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.ss-players [data-pid="${me}"]`)?.classList.add('me');
  const L = { at: 0, spawn: 0, combo: 0 };
  let phase = '', shown = -1;
  const now = () => performance.now() / 1000;

  function showToy() { if (shown === L.at) return; shown = L.at; toyEl.innerHTML = T[L.at] != null ? shape(B[T[L.at]], true) : ''; toyEl.className = 'ss-toy'; }
  function flash(text, cls) { const f = $('.ss-flash'); f.textContent = text; f.className = 'ss-flash ' + cls; void f.offsetWidth; f.classList.add('go'); }
  function paintCombo() { const c = $('.ss-combo'); c.textContent = L.combo >= 2 ? `Combo ×${L.combo}` : ''; c.classList.toggle('hot', worth(L.combo) > 1); }
  ui.addEventListener('pointerdown', e => {
    const b = e.target.closest('.ss-bin'); if (!b || watching || phase !== 'play' || T[L.at] == null) return;
    e.preventDefault();
    const bin = +b.dataset.b, ok = T[L.at] === bin;
    ctx.send('sort', { k: L.at, b: bin });
    b.classList.remove('good', 'bad'); void b.offsetWidth; b.classList.add(ok ? 'good' : 'bad');
    if (ok) { flash(`+${worth(L.combo)}`, 'plus'); L.combo++; ctx.sfx(L.combo % 5 === 0 ? 'coins' : 'good'); }
    else { if (L.combo >= 3) flash('Combo broken!', 'oops'); L.combo = 0; ctx.sfx('bad'); }
    L.at++; L.spawn = now(); showToy(); paintCombo();
  });
  function note(g) {
    if (g.phase === 'ready') return 'Match the SHAPE and the COLOUR!';
    if (g.phase === 'end') {
      if (init.solo) { const s = g.scores[players[0].pid], m = init.medals; return s >= m[2] ? `GOLD! ${s} points.` : s >= m[1] ? `SILVER! ${s} points.` : s >= m[0] ? `BRONZE! ${s} points.` : `${s} points. Bronze at ${m[0]}!`; }
      return 'Time! Most points wins.';
    }
    if (watching) return 'Sort, sort, sort!';
    return init.solo ? `Score attack! Bronze ${init.medals[0]} · Silver ${init.medals[1]} · Gold ${init.medals[2]}` : 'Tap the matching bin!';
  }
  return {
    state(g) {
      if (g.phase !== phase) {
        if (g.phase === 'play') { L.at = g.at[me] ?? 0; L.spawn = now(); L.combo = 0; shown = -1; showToy(); ctx.sfx('open'); }
        if (g.phase === 'end') ctx.sfx('win');
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.phase === 'play' && g.left <= 5);
      if (me != null && g.phase === 'play' && g.at[me] > L.at) { L.at = g.at[me]; L.spawn = now(); L.combo = g.combo[me]; showToy(); paintCombo(); }   // the server dropped a toy we had not
      for (const p of players) {
        const c = ui.querySelector(`.ss-players [data-pid="${p.pid}"]`); c.querySelector('.sc').textContent = g.scores[p.pid];
        c.querySelector('.ss-st').textContent = g.phase === 'end' ? `best ×${g.best[p.pid]}` : g.combo[p.pid] >= 2 ? `×${g.combo[p.pid]}` : '';
        const lane = ui.querySelector(`.ss-lane[data-pid="${p.pid}"]`);
        lane.querySelector('.ss-n').textContent = g.scores[p.pid];
        lane.querySelector('.ss-c').textContent = g.combo[p.pid] >= 2 ? `combo ×${g.combo[p.pid]}` : '';
        if (watching && g.phase === 'play') { const cur = lane.querySelector('.ss-cur'); if (cur.dataset.k !== String(g.at[p.pid])) { cur.dataset.k = g.at[p.pid]; cur.innerHTML = T[g.at[p.pid]] != null ? shape(B[T[g.at[p.pid]]], true) : ''; } }
      }
      if (g.phase === 'end') {
        const order = [...players].sort((a, b) => g.scores[b.pid] - g.scores[a.pid]);
        $('.ss-big').innerHTML = order.map((p, i) => `<div class="ss-final" style="--seat:${p.color}">${chip(p)}<b>${g.scores[p.pid]}</b><small>best combo ×${g.best[p.pid]}</small>${i === 0 && g.scores[p.pid] > 0 && !init.solo ? '<em>Winner!</em>' : ''}</div>`).join('');
      }
      $('.ss-note').textContent = note(g);
    },
    event(ev) {
      if (ev.e !== 'sort' || !watching) return;
      const lane = ui.querySelector(`.ss-lane[data-pid="${ev.pid}"]`); if (!lane) return;
      const cls = ev.ok ? 'good' : 'bad'; lane.classList.remove('good', 'bad'); void lane.offsetWidth; lane.classList.add(cls);
    },
    frame() {
      if (phase !== 'play' || watching || T[L.at] == null) return;
      const f = (now() - L.spawn) / init.fall[L.at];
      if (f >= 1) { L.combo = 0; L.at++; L.spawn = now(); flash('Dropped!', 'oops'); ctx.sfx('bad'); showToy(); paintCombo(); return; }
      toyEl.style.setProperty('--f', f.toFixed(4));
      toyEl.classList.toggle('low', f > 0.7);
    },
    dispose() {},
  };
}
