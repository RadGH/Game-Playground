// The game-mode screen (owner round 2, R2.10/R2.11): the first lobby step. Bannerline is a sandbox
// of modes; the cards come from the sim's mode registry (js/sim/modes/index.js modeList), so a new
// mode appears here when the sim registers it. Line War is playable; Hunters vs Farmers is shown as
// coming next; tower defense, a lanes-and-towers mode and Heroes and Empires are greyed "planned".
// Picking a mode hands its formats and allowed heroes/races to the seat screen (js/ui/lobby.js).

import { h } from './dom.js';
import { createMenuNav } from './menunav.js';
import { icon } from './icons.js';

// Player-facing blurbs for the cards (the registry's `desc` wins when it has one).
const BLURBS = {
  linewar: 'Two sides, two walled fields. Hire units to march on your rival while your hero holds your own field. Tear down their banners first.',
  hvf: 'Farmers hide, build and breed sheep in a wild, random world; hunters roam to find them before the farmers grow too strong.',
  td: 'Hold a winding road against waves with towers. Planned.',
  moba: 'Lanes, towers and heroes on one shared map. Planned.',
  empires: 'Build a realm and lead heroes across a campaign map. Planned.',
};
const ICONS = { linewar: 'flag', hvf: 'people', td: 'shield', moba: 'sword', empires: 'crown' };

export function createModeScreen({ screen, modes, onPick, onBack }) {
  screen.replaceChildren();
  const root = h('div', 'modes');
  screen.append(root);
  root.innerHTML = `
    <header class="md-top">
      <button class="lb-back" data-act="back">‹ Title</button>
      <div class="lb-title"><h1>Choose a game</h1><span>Bannerline is a sandbox of battle modes</span></div>
    </header>
    <div class="md-grid">${modes.map((m) => {
      const status = m.playable ? 'Play' : m.id === 'hvf' ? 'Coming next' : 'Planned';
      return `<button class="md-card${m.playable ? ' ready' : ' locked'}${m.id === 'hvf' ? ' next' : ''}" data-mode="${m.id}" ${m.playable ? '' : 'aria-disabled="true"'}
        data-tip="${m.playable ? `${m.name}: ${(m.formats || []).join(' · ')}` : `${m.name} is not playable yet.`}">
        <span class="md-ic">${icon(ICONS[m.id] || 'flag')}</span>
        <b>${m.name}</b>
        <p>${m.desc || BLURBS[m.id] || ''}</p>
        ${m.playable ? `<span class="md-formats">${(m.formats || []).map((f) => `<i>${f}</i>`).join('')}</span>` : ''}
        <span class="md-status">${status}</span>
      </button>`;
    }).join('')}</div>
    <p class="hint">Arrows or d-pad to choose · <kbd>Enter</kbd> / <kbd class="pad">A</kbd> to pick · <kbd>Esc</kbd> / <kbd class="pad">B</kbd> back</p>`;
  const nav = createMenuNav(root, { selector: '.md-card.ready, .lb-back', onBack: () => onBack() });
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="back"]')) { onBack(); return; }
    const c = e.target.closest('.md-card'); if (!c) return;
    const m = modes.find((x) => x.id === c.dataset.mode);
    if (m?.playable) onPick(m);
    else { c.classList.remove('refused'); void c.offsetWidth; c.classList.add('refused'); }
  });
  let shownAt = 0;
  return {
    show() { screen.hidden = false; shownAt = performance.now(); nav.focus('.md-card.ready'); },
    hide() { screen.hidden = true; },
    frame(f) { if (!screen.hidden && performance.now() - shownAt > 250) nav.handle(f); },
  };
}
