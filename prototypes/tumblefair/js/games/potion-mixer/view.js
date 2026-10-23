// POTION MIXER on a screen. A phone that plays: the recipe card (numbered ingredient pictures, a tick on the ones
// already in, an arrow on the next), a bubbling cauldron that takes the colour of the last thing dropped in, and the
// shelf as big picture buttons with names. A tap drops the ingredient in at once (the phone knows the recipes; the
// server checks again). Wrong = a grey puff of smoke over the pot and a one-second wait; the potion starts again.
// Bottled potions line up beside the pot. A watch-only screen (TV) shows everyone's cauldron in a row, each with its
// bottles, its progress on the current recipe and the same puffs and bubbles.
import { chip } from '../../client/gamehud.js';
import { ICONS } from './icons.js';
import { INGREDIENTS } from './sim.js';

const EYE = `<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="54" rx="40" ry="34" fill="#7dd36b" stroke="#0d2228" stroke-width="5"/>
  <circle cx="50" cy="52" r="27" fill="#fff" stroke="#0d2228" stroke-width="4"/><circle class="pm-pupil" cx="56" cy="58" r="13" fill="#0d2228"/><circle cx="44" cy="42" r="6" fill="#fff" opacity=".9"/>
  <path d="M14 34 Q50 4 86 34" fill="#5ab84a" stroke="#0d2228" stroke-width="5" stroke-linejoin="round"/></svg>`;
export function pic(i) {
  const I = INGREDIENTS[i]; if (I.icon === 'eye') return EYE;
  const [w, h, d, d2] = ICONS['duotone/' + I.icon];
  return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d2}" fill="${I.color}" opacity=".5"/><path d="${d}" fill="${I.color}"/></svg>`;
}
const CAULDRON = `<svg class="pm-pot" viewBox="0 0 160 130" aria-hidden="true"><path d="M30 118 l-8 10 M130 118 l8 10" stroke="#0d2228" stroke-width="7" stroke-linecap="round"/>
  <path d="M16 46 Q12 120 80 122 Q148 120 144 46 Z" fill="#3a3550" stroke="#0d2228" stroke-width="6"/>
  <ellipse class="pm-brew" cx="80" cy="46" rx="64" ry="14" fill="var(--brew)" stroke="#0d2228" stroke-width="6"/>
  <g class="pm-bubbles" fill="var(--brew)" stroke="#0d2228" stroke-width="3"><circle cx="58" cy="40" r="7"/><circle cx="92" cy="36" r="9"/><circle cx="110" cy="44" r="5"/></g>
  <circle cx="58" cy="82" r="5" fill="#fff"/><circle cx="102" cy="82" r="5" fill="#fff"/><path d="M68 96 Q80 106 92 96" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>
  <div class="pm-smoke"><i></i><i></i><i></i><b>Puff!</b></div>`;
const bottle = c => `<i class="pm-bottle" style="--b:${c}"></i>`;

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, R = init.recipes;
  ui.innerHTML = `
    <div class="pm-top"><span class="pm-title">Potion Mixer</span><span class="clock"><b>--</b></span></div>
    <div class="pm-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="pm-st"></strong>')).join('')}</div>
    <div class="pm-play">
      <div class="pm-card"><span class="pm-cardt"></span><div class="pm-steps"></div></div>
      <div class="pm-kettle" style="--brew:#6a5a9a">${CAULDRON}<div class="pm-shelfb"></div></div>
      <div class="pm-shelf"></div>
    </div>
    <div class="pm-row">${players.map(p => `<div class="pm-cell" data-pid="${p.pid}" style="--seat:${p.color}">${chip(p)}<div class="pm-kettle" style="--brew:#6a5a9a">${CAULDRON}</div><div class="pm-dots"></div><div class="pm-shelfb"></div><b class="pm-n">0 potions</b></div>`).join('')}</div>
    <div class="pm-big"></div>
    <p class="pm-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.pm-players [data-pid="${me}"]`)?.classList.add('me');
  const L = { at: 0, prog: 0, lock: 0, potions: 0 };
  let phase = '', lastSend = 0, shelfFor = -1;
  const now = () => performance.now() / 1000;

  function drawCard() {
    const r = R[L.at]; if (!r) return;
    $('.pm-cardt').textContent = `Potion ${L.at + 1}`;
    $('.pm-steps').innerHTML = r.map((i, s) => `<span class="pm-step${s < L.prog ? ' in' : s === L.prog ? ' next' : ''}"><em>${s + 1}</em>${pic(i)}<small>${INGREDIENTS[i].name}</small></span>`).join('');
    if (shelfFor !== L.at) {
      shelfFor = L.at;
      $('.pm-shelf').innerHTML = init.shelves[L.at].map(i => `<button class="pm-ing" data-i="${i}" style="--c:${INGREDIENTS[i].color}" aria-label="${INGREDIENTS[i].name}">${pic(i)}<span>${INGREDIENTS[i].name}</span></button>`).join('');
    }
  }
  function setBrew(kettle, i) { kettle.style.setProperty('--brew', i == null ? '#6a5a9a' : INGREDIENTS[i].color); kettle.classList.remove('plop'); void kettle.offsetWidth; kettle.classList.add('plop'); }
  function puff(kettle) { kettle.classList.remove('puff'); void kettle.offsetWidth; kettle.classList.add('puff'); kettle.style.setProperty('--brew', '#6a5a9a'); }
  function shelfB(el, n) { el.innerHTML = Array.from({ length: Math.min(n, 14) }, (_, k) => bottle(INGREDIENTS[R[k][R[k].length - 1]].color)).join('') + (n > 14 ? `<b>+${n - 14}</b>` : ''); }
  ui.addEventListener('pointerdown', e => {
    const b = e.target.closest('.pm-play .pm-ing'); if (!b || watching || phase !== 'play') return;
    e.preventDefault();
    const r = R[L.at], i = +b.dataset.i, k = $('.pm-play .pm-kettle'); if (!r) return;
    if (now() < L.lock) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); return; }
    ctx.send('add', { k: L.at, s: L.prog, i }); lastSend = now();
    if (r[L.prog] === i) {
      L.prog++; setBrew(k, i); b.classList.remove('drop'); void b.offsetWidth; b.classList.add('drop');
      if (L.prog === r.length) { L.potions++; L.at++; L.prog = 0; ctx.sfx('win'); shelfB($('.pm-play .pm-shelfb'), L.potions); setTimeout(() => setBrew(k, null), 350); } else ctx.sfx('pick');
    } else { L.prog = 0; L.lock = now() + init.smoke; puff(k); ctx.sfx('bad'); ui.classList.add('smoky'); }
    drawCard();
  });
  function note(g) {
    if (g.phase === 'ready') return 'Read the recipe, then tap the ingredients in order!';
    if (g.phase === 'end') {
      if (init.solo) { const s = g.scores[players[0].pid], m = init.medals; return s >= m[2] ? `GOLD cauldron! ${s} potions.` : s >= m[1] ? `SILVER cauldron! ${s} potions.` : s >= m[0] ? `BRONZE cauldron! ${s} potions.` : `${s} potions. Bronze at ${m[0]}!`; }
      return 'Cauldrons cool! Most potions wins.';
    }
    if (watching) return 'Bubble, bubble! Who can brew the most?';
    return init.solo ? `Brew as many as you can! Bronze ${init.medals[0]} · Silver ${init.medals[1]} · Gold ${init.medals[2]}` : 'Follow the recipe, in order!';
  }
  return {
    state(g) {
      if (g.phase !== phase) {
        if (g.phase === 'play') { if (me != null) { L.at = g.at[me]; L.prog = g.prog[me]; L.potions = g.scores[me]; } shelfFor = -1; drawCard(); ctx.sfx('open'); }
        if (g.phase === 'end') ctx.sfx('win');
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.phase === 'play' && g.left <= 5);
      if (me != null && g.phase === 'play') {
        const ahead = g.at[me] > L.at || (g.at[me] === L.at && g.prog[me] > L.prog), behind = g.at[me] < L.at || (g.at[me] === L.at && g.prog[me] < L.prog);
        if (ahead || (behind && now() - lastSend > 2)) { L.at = g.at[me]; L.prog = g.prog[me]; L.potions = g.scores[me]; drawCard(); shelfB($('.pm-play .pm-shelfb'), L.potions); }
      }
      for (const p of players) {
        const c = ui.querySelector(`.pm-players [data-pid="${p.pid}"]`); c.querySelector('.sc').textContent = g.scores[p.pid];
        c.querySelector('.pm-st').textContent = g.lock.includes(p.pid) ? 'puff!' : g.phase === 'play' && R[g.at[p.pid]] ? `${g.prog[p.pid]}/${R[g.at[p.pid]].length}` : '';
        const cell = ui.querySelector(`.pm-cell[data-pid="${p.pid}"]`), r = R[g.at[p.pid]];
        cell.querySelector('.pm-dots').innerHTML = r ? r.map((i, s) => `<span class="${s < g.prog[p.pid] ? 'in' : ''}">${pic(i)}</span>`).join('') : '';
        if (watching && r) cell.querySelector('.pm-kettle').style.setProperty('--brew', g.prog[p.pid] ? INGREDIENTS[r[g.prog[p.pid] - 1]].color : '#6a5a9a');
        cell.querySelector('.pm-n').textContent = `${g.scores[p.pid]} potion${g.scores[p.pid] === 1 ? '' : 's'}`;
        const sb = cell.querySelector('.pm-shelfb'); if (sb.dataset.n !== String(g.scores[p.pid])) { sb.dataset.n = g.scores[p.pid]; shelfB(sb, g.scores[p.pid]); }
      }
      if (g.phase === 'end') {
        const order = [...players].sort((a, b) => g.scores[b.pid] - g.scores[a.pid]);
        $('.pm-big').innerHTML = order.map((p, i) => `<div class="pm-final" style="--seat:${p.color}">${chip(p)}<b>${g.scores[p.pid]}</b><small>potion${g.scores[p.pid] === 1 ? '' : 's'}</small>${i === 0 && g.scores[p.pid] > 0 && !init.solo ? '<em>Top witch!</em>' : ''}</div>`).join('');
      }
      $('.pm-note').textContent = note(g);
    },
    event(ev) {
      if (!watching) return;
      const cell = ui.querySelector(`.pm-cell[data-pid="${ev.pid}"]`); if (!cell) return;
      const k = cell.querySelector('.pm-kettle');
      if (ev.e === 'smoke') puff(k);
      if (ev.e === 'brew') { setBrew(k, R[ev.k][R[ev.k].length - 1]); ctx.sfx('good'); }
    },
    frame() { if (ui.classList.contains('smoky') && now() >= L.lock) ui.classList.remove('smoky'); },
    dispose() {},
  };
}
