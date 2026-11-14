// Ship screens deck (owner 2026-11-13: "a menu button that opens a submenu that makes it easier to navigate between
// cargo, ships, etc without looking like the settings menu/pause menu"). A grid of picture tiles that drops from
// its own top-bar button (and from a button in the head of every ship screen), so Cargo → Ships → Star map is
// two taps from anywhere. The ☰ menu keeps Resume / Settings / Save. main.js hands in the openers (`app.nav`).
import { el } from './dom.js';

// 24×24 line pictures, drawn for this deck (stroke = currentColor)
const P = {
  cargo: '<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/>',
  parts: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/><rect x="10" y="10" width="4" height="4"/>',
  drones: '<circle cx="12" cy="12" r="3"/><circle cx="5" cy="5" r="2.4"/><circle cx="19" cy="5" r="2.4"/><circle cx="5" cy="19" r="2.4"/><circle cx="19" cy="19" r="2.4"/><path d="M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3"/>',
  ships: '<path d="M12 2l4 7v8l-4 3-4-3V9z"/><path d="M8 12l-4 4v3l4-2M16 12l4 4v3l-4-2"/>',
  build: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M17.5 14v7M14 17.5h7"/>',
  upgrades: '<path d="M12 21V8M6 13l6-6 6 6"/><path d="M5 3h14"/>',
  fab: '<path d="M4 20h16M6 20v-4h12v4M8 16l1-6h6l1 6"/><path d="M12 10V4M9 6l3-2 3 2"/>',
  local: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/><circle cx="12" cy="12" r="1.2"/>',
  stars: '<circle cx="6" cy="17" r="2"/><circle cx="17" cy="6" r="2"/><circle cx="18" cy="17" r="1.5"/><circle cx="7" cy="6" r="1.5"/><path d="M7.5 15.5l8-8M7.5 17.5h9M8 7.5l-1 7.5"/>',
  goals: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
  rep: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  finds: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 3-6 6-6s6 2 6 6"/><path d="M16 4l1.2 2.4L20 7l-2 2 .5 2.8L16 10.5l-2.5 1.3L14 9l-2-2 2.8-.6z"/>',
};
export const navIcon = (id, size = 24) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[id] || ''}</svg>`;
/** The deck's own button picture: four tiles. */
export const DECK_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>';

/**
 * Tiles, grouped. `key` = the panel tag main.js gives that screen (so the current one is lit), `hot` = its key.
 * `show(app)` says whether the tile is there at all; `why(app)` greys it out with a reason.
 */
export const TILES = [
  { group: 'Ship', items: [
    { id: 'cargo', label: 'Cargo', hot: 'I', key: 'hold:cargo' },
    { id: 'parts', label: 'Parts', key: 'hold:parts' },
    { id: 'drones', label: 'Drones', hot: 'C', key: 'hold:drones' },
    { id: 'ships', label: 'Ships', key: 'hold:ships' },
    { id: 'build', label: 'Build', hot: 'B', key: 'build', show: a => a.G.unlocked.build, why: a => a.mode === 'fly' && a.w.t - a.combatOK() < 5 ? 'In combat' : null },
    { id: 'upgrades', label: 'Upgrades', key: 'upgrades' },
    { id: 'fab', label: 'Fabricator', key: 'fab', show: a => !!a.P?.stats.fab },
  ] },
  { group: 'Space', items: [
    { id: 'local', label: 'Local map', hot: 'N', key: 'local', why: a => a.mode === 'docked' ? 'Undock first' : null },
    { id: 'stars', label: 'Star map', hot: 'M', key: 'map', show: a => a.G.unlocked.galaxy },
    { id: 'goals', label: 'Goals', hot: 'J', key: 'quests' },
  ] },
  { group: 'People', items: [
    { id: 'rep', label: 'Factions', key: 'hold:rep' },
    { id: 'finds', label: 'Crew & finds', key: 'hold:finds' },
  ] },
];

/** Which tile is the screen on top right now (hold panels report their tab). */
function current() {
  const top = document.querySelector('#panels')?.lastElementChild;
  if (!top?.dataset.key) return null;
  if (top.dataset.navTab) return 'hold:' + top.dataset.navTab;
  return top.dataset.key;
}

/** Open the deck. `from` = the button it drops from (for placement). */
export function openNav(app, from) {
  const panels = document.querySelector('#panels');
  const prev = panels.querySelector('.nav-back'); if (prev) { prev.remove(); return; }
  const wasMode = app.mode; if (app.mode === 'fly') app.mode = 'paused';
  const back = el('div', { class: 'modal-back nav-back' });
  const deck = el('div', { class: 'modal nav-deck', role: 'dialog', 'aria-label': 'Ship screens' });
  const close = () => { back.remove(); if (app.mode === 'paused' && wasMode === 'fly') app.mode = 'fly'; };
  back.addEventListener('click', e => { if (e.target === back) close(); });
  back.closeNav = close;
  const on = current();
  for (const g of TILES) {
    const items = g.items.filter(t => !t.show || t.show(app));
    if (!items.length) continue;
    const grid = el('div', { class: 'nav-grid' });
    for (const t of items) {
      const why = t.why?.(app) || null;
      const b = el('button', { class: 'nav-tile' + (t.key === on ? ' on' : '') + (why ? ' off' : ''), type: 'button', 'data-nav': t.id, 'aria-label': t.label + (why ? ` — ${why}` : '') },
        el('span', { class: 'nav-ic', html: navIcon(t.id, 26) }), el('span', { class: 'nav-l' }, t.label),
        why ? el('small', { class: 'nav-why' }, why) : t.hot ? el('kbd', {}, t.hot) : '');
      b.addEventListener('click', () => {
        if (why) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
        back.remove();
        app.mode = wasMode === 'fly' ? 'fly' : app.mode;   // the screen we open pauses again in its own way
        if (t.key !== on) app.nav.go(t.id);
      });
      grid.append(b);
    }
    deck.append(el('div', { class: 'nav-group' }, el('div', { class: 'nav-gh' }, g.group), grid));
  }
  back.append(deck); panels.append(back);
  // drop from the button that opened it (phones: full width under the top bar)
  const r = from?.getBoundingClientRect();
  if (r && innerWidth > 560) { deck.style.left = Math.max(8, Math.min(innerWidth - deck.offsetWidth - 8, r.left)) + 'px'; deck.style.top = (r.bottom + 8) + 'px'; }
  else if (r) deck.style.top = (r.bottom + 8) + 'px';
  return close;
}

/** The deck button for the head of a ship screen. */
export function deckButton(app) {
  const b = el('button', { class: 'nav-head-btn', type: 'button', 'aria-label': 'Ship screens', html: `${DECK_ICON}<span>Screens</span>` });
  b.addEventListener('click', () => openNav(app, b));
  return b;
}
