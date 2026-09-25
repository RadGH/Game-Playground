// Screen definitions registered on the Menus router. (Free Play setup, campaign and settings are
// in their own files.)

import { button, el } from './menus.js';
import { fmtTime } from '../core/util.js';

export const VERSION = '0.5.0';

export function registerScreens(app, menus) {
  menus.register('title', (root, p, m) => {
    root.appendChild(el('div', 'logo', '<div class="logo-main">TINY&nbsp;RTS</div><div class="logo-sub">hold the line · pixel by pixel</div>'));
    const col = el('div', 'menu-col');
    if (app.hasSuspend) col.appendChild(button('Continue', () => app.continueSuspended(), 'primary'));
    col.appendChild(button('Campaign', () => m.show('campaign'), app.hasSuspend ? '' : 'primary'));
    col.appendChild(button('Free Play', () => m.show('setup')));
    col.appendChild(button('How to Play', () => m.show('howto')));
    col.appendChild(button('Settings', () => m.show('settings')));
    col.appendChild(button('Credits', () => m.show('credits')));
    col.appendChild(button('Fullscreen', () => app.toggleFullscreen(), 'small'));
    root.appendChild(col);
    root.appendChild(el('div', 'version', `v${VERSION}`));
    if (app.smallScreen) {
      const n = el('div', 'notice', 'Tiny RTS is built for a keyboard and mouse on a bigger screen. Menus work here, but the game itself needs a desktop.');
      root.appendChild(n);
    }
  });

  menus.register('pause', (root, p, m) => {
    root.appendChild(el('h2', '', 'Paused'));
    const col = el('div', 'menu-col');
    col.appendChild(button('Resume', () => app.closePause(), 'primary'));
    col.appendChild(button('Settings', () => m.show('settings', { overlay: true })));
    col.appendChild(button('How to Play', () => m.show('howto', { overlay: true })));
    col.appendChild(button('Restart', () => m.show('confirm', { overlay: true, text: 'Restart this match? Progress in it is lost.', yes: () => app.restart() })));
    if (app.canSuspend()) col.appendChild(button('Save &amp; Quit', () => app.suspendAndQuit()));
    col.appendChild(button('Quit to Title', () => m.show('confirm', { overlay: true, text: 'Quit to the title screen? Progress in this match is lost.', yes: () => app.quitToTitle() })));
    root.appendChild(col);
  });

  menus.register('confirm', (root, p, m) => {
    root.appendChild(el('p', 'confirm-text', p.text));
    const row = el('div', 'menu-row');
    row.appendChild(button('Yes', () => { m.back(); p.yes(); }, 'primary danger'));
    row.appendChild(button('No', () => m.back()));
    root.appendChild(row);
  });

  menus.register('results', (root, p, m) => {
    const g = p.game;
    const win = g.result.winner === 1;
    root.appendChild(el('div', 'banner ' + (win ? 'win' : 'lose'), win ? 'VICTORY' : 'DEFEAT'));
    root.appendChild(el('div', 'reason', g.result.reason));
    if (p.stars) {
      const s = el('div', 'stars');
      p.stars.forEach((st, i) => s.appendChild(el('div', 'star ' + (st.got ? 'got' : ''), `<span>★</span><small>${st.text}</small>`)));
      root.appendChild(s);
    }
    const t = g.teams[1];
    const kills = Object.entries(t.stats.kills).sort((a, b) => b[1] - a[1]);
    const totalKills = kills.reduce((n, [, v]) => n + v, 0);
    const stats = el('div', 'stats-grid');
    const row = (k, v) => stats.appendChild(el('div', 'st', `<span>${k}</span><b>${v}</b>`));
    row('Time', fmtTime(g.time));
    row('Enemies destroyed', totalKills);
    row('Crystal mined', Math.round(t.stats.mined.c));
    row('Ferrite mined', Math.round(t.stats.mined.f));
    row('Alloy made', Math.round(t.stats.mined.a));
    row('Wall cells built', t.stats.cellsBuilt);
    row('Wall cells lost', t.stats.cellsLost);
    row('Buildings/units lost', t.stats.lost);
    if (g.waves) row('Waves cleared', g.waves.cleared);
    root.appendChild(stats);
    if (kills.length) {
      const kl = el('div', 'kills');
      kl.innerHTML = '<h3>Destroyed</h3>' + kills.slice(0, 10).map(([k, v]) => `<div>${nameOf(g, k)} <b>${v}</b></div>`).join('');
      root.appendChild(kl);
    }
    const dmg = Object.entries(t.stats.dmgBy).filter(([, v]) => v > 0);
    if (dmg.length) {
      const max = Math.max(...dmg.map(([, v]) => v));
      const ch = el('div', 'dmg-chart', '<h3>Damage dealt by type</h3>' + dmg.sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="bar-row"><span>${k}</span><i style="width:${Math.max(2, Math.round((v / max) * 100))}%" class="dt-${k}"></i><b>${Math.round(v)}</b></div>`).join(''));
      root.appendChild(ch);
    }
    const r = el('div', 'menu-row');
    if (win && p.next) r.appendChild(button('Continue', () => p.next(), 'primary'));
    r.appendChild(button('Retry', () => app.restart(), win && p.next ? '' : 'primary'));
    r.appendChild(button('Title', () => app.quitToTitle()));
    root.appendChild(r);
  });

  // Placeholders replaced in later milestones.
  for (const name of ['campaign', 'howto', 'settings']) {
    if (menus.screens[name]) continue;
    menus.register(name, (root, p, m) => { root.appendChild(el('h2', '', name)); root.appendChild(el('p', '', 'Coming soon.')); root.appendChild(button('Back', () => m.back(), 'primary')); });
  }
  menus.register('setup', (root, p, m) => {
    root.appendChild(el('h2', '', 'Free Play'));
    const col = el('div', 'menu-col');
    col.appendChild(button('Siege (10 waves)', () => app.startGame(app.quickOpts('siege')), 'primary'));
    col.appendChild(button('Versus (Umbra AI)', () => app.startGame(app.quickOpts('versus'))));
    col.appendChild(button('Back', () => m.back()));
    root.appendChild(col);
  });

  menus.register('credits', (root, p, m) => {
    root.appendChild(el('h2', '', 'Credits'));
    root.appendChild(el('div', 'credits credits-text', `
      <p><b>Tiny RTS</b> — design and direction by <b>Radley Sustaire</b> (radleysustaire.com).</p>
      <p>Built with Claude Code. Every sprite is drawn by code and every sound is synthesized live — no asset files.</p>
      <p>Font: <b>Silkscreen</b> by Jason Kottke (SIL Open Font License), via Google Fonts.</p>
      <p class="c-dim">v${VERSION}</p>`));
    root.appendChild(button('Back', () => m.back(), 'primary'));
  });
}

function nameOf(game, type) {
  return game.data.buildings.list[type]?.name || game.data.units.list[type]?.name || game.data.enemies.list[type]?.name || type;
}
