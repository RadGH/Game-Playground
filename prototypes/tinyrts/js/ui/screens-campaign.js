// Campaign map ("the signal line"), mission briefing, and campaign results (stars, unlocks).

import { button, el } from './menus.js';
import { loadProgress, saveProgress } from './progress.js';
import { missionOpts } from '../sim/missions.js';
import { iconFor } from './icons.js';
import { fmtTime } from '../core/util.js';

export function registerCampaignScreens(app, menus) {
  menus.register('campaign', (root, p, m) => {
    const data = app.data;
    const missions = data.campaign.missions;
    const prog = loadProgress();
    let sel = Math.min(p.sel ?? prog.unlocked, missions.length - 1);
    root.classList.add('wide', 'campaign');
    const render = () => {
      root.innerHTML = '';
      root.appendChild(el('h2', '', `Campaign · ${data.campaign.title}`));
      const diff = el('div', 'opt-row diff-row');
      diff.appendChild(el('span', 'opt-label', 'Difficulty'));
      const seg = el('div', 'seg');
      for (const [k, t] of [['story', 'Story'], ['normal', 'Normal'], ['hard', 'Hard']]) {
        const b = el('button', 'seg-btn' + (prog.difficulty === k ? ' on' : ''), t);
        b.addEventListener('click', () => { prog.difficulty = k; saveProgress(prog); render(); });
        seg.appendChild(b);
      }
      diff.appendChild(seg);
      root.appendChild(diff);
      // The line of nodes.
      const line = el('div', 'signal-line');
      missions.forEach((ms, i) => {
        const locked = i > prog.unlocked;
        const stars = prog.stars[ms.id] || 0;
        const node = el('button', 'node' + (i === sel ? ' sel' : '') + (locked ? ' locked' : '') + (i < prog.unlocked ? ' done' : ''));
        node.innerHTML = `<span class="num">${i}</span><span class="nstars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`;
        node.title = locked ? 'Locked' : ms.name;
        node.addEventListener('click', () => { if (!locked) { sel = i; p.sel = i; render(); } });
        line.appendChild(node);
        if (i < missions.length - 1) line.appendChild(el('div', 'beam' + (i < prog.unlocked ? ' lit' : '')));
      });
      root.appendChild(line);
      // Details.
      const ms = missions[sel];
      const det = el('div', 'mission-detail');
      const stars = prog.stars[ms.id] || 0;
      const best = prog.best[ms.id];
      det.innerHTML = `
        <div class="md-name">${sel}. ${ms.name}</div>
        <div class="md-blurb">${ms.blurb}</div>
        <div class="md-obj"><b>Objective:</b> ${ms.objective}</div>
        <div class="md-stars">${ms.stars.map((t, k) => `<div class="${k < stars ? 'got' : ''}">${k < stars ? '★' : '☆'} ${t}</div>`).join('')}</div>
        ${best ? `<div class="c-dim">Best time: ${fmtTime(best)}</div>` : ''}
        <div class="md-new"></div>`;
      const nw = det.querySelector('.md-new');
      const icons = [...(ms.newTech || []).map((t) => ({ t, kind: data.buildings.list[t] ? 'b' : data.buildings.walls[t] ? 'wall' : 'u' })), ...(ms.newEnemies || []).map((t) => ({ t, kind: 'e' }))];
      if (icons.length) {
        nw.appendChild(el('span', 'c-dim', 'New: '));
        for (const ic of icons) {
          const cv = el('canvas'); cv.width = 26; cv.height = 26; cv.title = nameOf(data, ic.t);
          cv.getContext('2d').drawImage(iconFor({ kind: ic.kind, type: ic.t }, 26), 0, 0);
          nw.appendChild(cv);
        }
      }
      root.appendChild(det);
      const row = el('div', 'menu-row');
      row.appendChild(button('Briefing ▶', () => m.show('briefing', { index: sel }), 'primary'));
      row.appendChild(button('Back', () => m.back()));
      root.appendChild(row);
      root.querySelector('.mbtn.primary')?.focus({ preventScroll: true });
    };
    render();
  });

  menus.register('briefing', (root, p, m) => {
    const data = app.data;
    const ms = data.campaign.missions[p.index];
    root.classList.add('wide');
    root.appendChild(el('h2', '', `${p.index}. ${ms.name}`));
    const b = el('div', 'briefing briefing-text');
    b.innerHTML = ms.briefing.split('\n').map((l) => `<p>${l}</p>`).join('') + `<p class="md-obj"><b>Objective:</b> ${ms.objective}</p>`;
    root.appendChild(b);
    const cards = el('div', 'tech-cards');
    for (const t of ms.newTech || []) cards.appendChild(techCard(data, t, false));
    for (const t of ms.newEnemies || []) cards.appendChild(techCard(data, t, true));
    if (cards.children.length) { root.appendChild(el('h3', '', 'New this mission')); root.appendChild(cards); }
    const row = el('div', 'menu-row');
    row.appendChild(button('Begin', () => app.startMission(p.index), 'primary'));
    row.appendChild(button('Back', () => m.back()));
    root.appendChild(row);
  });
}

function techCard(data, t, enemy) {
  const d = enemy ? data.enemies.list[t] : data.buildings.list[t] || data.buildings.walls[t] || data.units.list[t];
  const kind = enemy ? 'e' : data.buildings.list[t] ? 'b' : data.buildings.walls[t] ? 'wall' : 'u';
  const c = el('div', 'fg-card' + (enemy ? ' enemy' : ''));
  const cv = el('canvas'); cv.width = 36; cv.height = 36;
  cv.getContext('2d').drawImage(iconFor({ kind, type: t }, 36), 0, 0);
  c.appendChild(cv);
  c.appendChild(el('div', 'fg-text', `<b>${d.name}</b><br>${d.desc || ''}`));
  return c;
}

function nameOf(data, t) {
  return data.buildings.list[t]?.name || data.buildings.walls[t]?.name || data.units.list[t]?.name || data.enemies.list[t]?.name || t;
}

// App hooks: start a mission, and record results.
export function installCampaign(app) {
  app.startMission = (index) => {
    const prog = loadProgress();
    const opts = missionOpts(app.data, index, prog.difficulty || 'normal');
    app.startGame(opts);
    app.hud.flash(`${index}. ${app.data.campaign.missions[index].name}`);
  };
  app.resultExtras = (g) => {
    if (g.opts.missionIndex == null || !g.objectives) return {};
    const idx = g.opts.missionIndex;
    const ms = app.data.campaign.missions[idx];
    const stars = g.objectives.stars();
    const won = g.result.winner === 1;
    if (won) {
      const prog = loadProgress();
      const got = stars.filter((s) => s.got).length;
      prog.stars[ms.id] = Math.max(prog.stars[ms.id] || 0, got);
      if (!prog.best[ms.id] || g.time < prog.best[ms.id]) prog.best[ms.id] = Math.round(g.time);
      prog.unlocked = Math.max(prog.unlocked, Math.min(idx + 1, app.data.campaign.missions.length - 1));
      if (idx === app.data.campaign.missions.length - 1) prog.finished = true;
      saveProgress(prog);
    }
    const hasNext = idx + 1 < app.data.campaign.missions.length;
    return {
      stars,
      next: won ? (hasNext ? () => { app.menus.closeAll(); app.menus.show('briefing', { index: idx + 1 }); } : () => { app.showTitle(); app.menus.show('credits'); }) : null,
    };
  };
}
