// Results screen (PLAN §12 step 5, M1 cut): win/lose, banners left, per-player stats, the income
// curve, sends by unit; Play again / Title. The damage meter + back-to-lobby land with M2.

import { TEAM_CSS } from '../view/terrain.js';
import { clockText } from './dom.js';
import { fmt } from '../../../../shared/format.js';

const REASONS = { banners: 'All banners torn down', cap: 'Time ran out — more banners wins', surrender: 'Surrendered' };

export function showResults({ card, sim, player, onAgain, onTitle }) {
  const s = sim.state, data = sim.data;
  const r = s.result || { winner: -1, reason: 'cap', tick: s.tick };
  const myTeam = s.players[player].team;
  const word = r.winner === -1 ? 'Draw' : r.winner === myTeam ? 'Victory' : 'Defeat';
  const cls = r.winner === -1 ? 'draw' : r.winner === myTeam ? 'win' : 'lose';
  const tickHz = data.econ?.clock?.tickHz || 20;
  const teams = s.teams.map((t) => {
    const ps = s.players.filter((p) => p.team === t.id);
    return `<div class="result-team t${t.id}">
      <h3><span>${t.id === myTeam ? 'Your side' : 'Rival side'}</span><span class="ban">${Math.ceil(t.banners)} / ${t.bannersMax} banners</span></h3>
      ${ps.map((p) => `<dl class="stat-list">
        <dt>${p.name}</dt><dd>${data.heroes?.heroes?.[p.hero]?.name || p.hero} · level ${p.level}</dd>
        <dt>Income at the end</dt><dd>+${Math.round(p.income)}</dd>
        <dt>Sends bought</dt><dd>${p.stats.sends}</dd>
        <dt>Gold on sends</dt><dd>${fmt(p.stats.sendGold, { decimals: 0 })}</dd>
        <dt>Gold on Muster / potions</dt><dd>${fmt(p.stats.musterGold, { decimals: 0 })} / ${fmt(p.stats.potionGold, { decimals: 0 })}</dd>
        <dt>Kills</dt><dd>${p.stats.kills}</dd>
        <dt>Hero deaths</dt><dd>${p.stats.deaths}</dd>
        <dt>Banners torn from the enemy</dt><dd>${fmt(p.stats.dealt, { decimals: 1 })}</dd>
        <dt>Bounty earned</dt><dd>${fmt(p.stats.bounty, { decimals: 0 })}</dd>
      </dl>`).join('')}
    </div>`;
  }).join('');

  card.innerHTML = `
    <div class="result-head">
      <div class="result-word ${cls}">${word}</div>
      <div class="result-sub">${REASONS[r.reason] || r.reason} · ${clockText((r.tick ?? s.tick) / tickHz)}</div>
    </div>
    <div class="result-grid">${teams}</div>
    ${incomeChart(s)}
    <div class="result-actions">
      <button class="menu-btn primary" data-act="again">Play again <kbd>Enter</kbd></button>
      <button class="menu-btn" data-act="title">Title <kbd>Esc</kbd></button>
    </div>`;
  const onClick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'again') done(onAgain);
    if (act === 'title') done(onTitle);
  };
  const onKey = (e) => {
    if (e.code === 'Enter') { e.preventDefault(); done(onAgain); }
    if (e.code === 'Escape') { e.preventDefault(); done(onTitle); }
  };
  function done(fn) { card.removeEventListener('click', onClick); window.removeEventListener('keydown', onKey); fn(); }
  card.addEventListener('click', onClick);
  // A short grace period so a key held from the match does not skip the screen.
  setTimeout(() => window.addEventListener('keydown', onKey), 600);
}

function incomeChart(s) {
  const series = s.players.map((p) => ({ team: p.team, pts: [...(p.stats.incomeAt || []), p.income] }));   // + the final value
  const n = Math.max(2, ...series.map((x) => x.pts.length));
  const max = Math.max(20, ...series.flatMap((x) => x.pts));
  const W = 700, H = 120, pad = 8;
  const X = (i) => pad + (i / (n - 1)) * (W - pad * 2);
  const Y = (v) => H - pad - (v / max) * (H - pad * 2);
  const lines = series.map((x) => x.pts.length ? `<polyline fill="none" stroke="${TEAM_CSS[x.team]}" stroke-width="2.5" stroke-linejoin="round" points="${x.pts.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>` : '').join('');
  const grid = [0.25, 0.5, 0.75].map((f) => `<line x1="${pad}" x2="${W - pad}" y1="${Y(max * f)}" y2="${Y(max * f)}" stroke="rgba(255,255,255,.07)"/>`).join('');
  return `<svg class="income-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${lines}</svg>
    <div class="chart-legend"><span><i style="background:${TEAM_CSS[0]}"></i>Your income per minute</span><span><i style="background:${TEAM_CSS[1]}"></i>Rival income</span><span>peak ${Math.round(max)}</span></div>`;
}
