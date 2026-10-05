// Results screen (PLAN §12 step 5, M1 cut): win/lose, banners left, per-player stats, the income
// curve; Back to the lobby (slots and devices kept) / Rematch / Title, by mouse, keyboard or pad.

import { TEAM_CSS } from '../view/terrain.js';
import { clockText } from './dom.js';
import { fmt } from '../../../../shared/format.js';
import { createMenuNav } from './menunav.js';

const TEAM_WORDS = ['Blue banner', 'Red banner'];

const REASONS = { banners: 'All banners torn down', cap: 'Time ran out — more banners wins', surrender: 'Surrendered' };

export function showResults({ card, sim, players, onLobby, onRematch, onTitle, online = false }) {
  const s = sim.state, data = sim.data;
  const r = s.result || { winner: -1, reason: 'cap', tick: s.tick };
  const localTeams = [...new Set(players.map((p) => s.players[p].team))];
  const myTeam = localTeams[0];
  let word, cls;
  if (r.winner === -1) { word = 'Draw'; cls = 'draw'; }
  else if (localTeams.length !== 1) { word = `${TEAM_WORDS[r.winner] || 'A side'} wins`; cls = 'win'; }   // split screen on both sides, or a spectator (no seat)
  else { word = r.winner === myTeam ? 'Victory' : 'Defeat'; cls = r.winner === myTeam ? 'win' : 'lose'; }
  const tickHz = data.econ?.clock?.tickHz || 20;
  const teams = s.teams.map((t) => {
    const ps = s.players.filter((p) => p.team === t.id);
    const label = localTeams.length !== 1 ? TEAM_WORDS[t.id] : t.id === myTeam ? 'Your side' : 'Rival side';
    return `<div class="result-team t${t.id}">
      <h3><span>${label}</span><span class="ban">${Math.max(0, Math.ceil(t.banners))} / ${t.bannersMax} banners</span></h3>
      ${ps.map((p) => `<dl class="stat-list">
        <dt class="who">${p.name}</dt><dd class="who">${data.heroes?.heroes?.[p.hero]?.name || p.hero} · level ${p.level}</dd>
        <dt>Income at the end</dt><dd>+${Math.round(p.income)}</dd>
        <dt>Sends bought</dt><dd>${p.stats.sends}</dd>
        <dt>Gold on sends</dt><dd>${fmt(p.stats.sendGold, { decimals: 0 })}</dd>
        <dt>Gold on items / training / powers</dt><dd>${fmt(p.stats.itemGold || 0, { decimals: 0 })} / ${fmt(p.stats.upgradeGold || 0, { decimals: 0 })} / ${fmt(p.stats.powerGold || 0, { decimals: 0 })}</dd>
        <dt>Kills · hero deaths</dt><dd>${p.stats.kills} · ${p.stats.deaths}</dd>
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
    ${incomeChart(s, myTeam)}
    <div class="result-actions">
      <button class="menu-btn primary" data-act="lobby">Back to the lobby</button>
      ${online ? '' : '<button class="menu-btn" data-act="rematch">Rematch</button>'}
      <button class="menu-btn" data-act="title">Title</button>
    </div>
    <p class="hint">Arrows or d-pad to choose · <kbd>Enter</kbd> / <kbd class="pad">A</kbd> to confirm</p>`;
  let done = false;
  const finish = (fn) => { if (done) return; done = true; nav.destroy(); fn(); };
  const nav = createMenuNav(card, { selector: '.result-actions button', initial: '[data-act="lobby"]', onBack: () => finish(onLobby) });
  nav.focus('[data-act="lobby"]');
  card.onclick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'lobby') finish(onLobby);
    if (act === 'rematch') finish(onRematch);
    if (act === 'title') finish(onTitle);
  };
  // A short grace period so a button held from the match does not skip the screen.
  const shownAt = performance.now();
  return {
    frame(f) { if (!done && performance.now() - shownAt > 600) nav.handle(f); },
    get done() { return done; },
  };
}

function incomeChart(s, myTeam = 0) {
  const series = s.players.map((p) => ({ team: p.team, pts: [...(p.stats.incomeAt || []), p.income] }));   // + the final value
  const n = Math.max(2, ...series.map((x) => x.pts.length));
  const max = Math.max(20, ...series.flatMap((x) => x.pts));
  const W = 700, H = 120, pad = 8;
  const X = (i) => pad + (i / (n - 1)) * (W - pad * 2);
  const Y = (v) => H - pad - (v / max) * (H - pad * 2);
  const lines = series.map((x) => x.pts.length ? `<polyline fill="none" stroke="${TEAM_CSS[x.team]}" stroke-width="2.5" stroke-linejoin="round" points="${x.pts.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>` : '').join('');
  const grid = [0.25, 0.5, 0.75].map((f) => `<line x1="${pad}" x2="${W - pad}" y1="${Y(max * f)}" y2="${Y(max * f)}" stroke="rgba(255,255,255,.07)"/>`).join('');
  return `<svg class="income-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${lines}</svg>
    <div class="chart-legend"><span><i style="background:${TEAM_CSS[0]}"></i>Blue income per minute</span><span><i style="background:${TEAM_CSS[1]}"></i>Red income</span><span>peak ${Math.round(max)}</span></div>`;
}
