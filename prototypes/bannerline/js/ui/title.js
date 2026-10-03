// Title screen: Play (-> the lobby), and the online / campaign entries that arrive in later
// milestones. Driven by mouse, keyboard or any controller through createMenuNav.

import { createMenuNav } from './menunav.js';

export function createTitle({ screen, onPlay, onHost = () => {}, onJoin = () => {} }) {
  const menu = screen.querySelector('#title-menu');
  const nav = createMenuNav(menu, { initial: '.primary' });
  menu.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'play') onPlay();
    if (act === 'host') onHost();
    if (act === 'join') onJoin();
  });
  let shownAt = 0;
  return {
    show() { screen.hidden = false; shownAt = performance.now(); nav.focus('.primary'); },
    hide() { screen.hidden = true; },
    get visible() { return !screen.hidden; },
    /** Menu input from any device. */
    frame(f) { if (!screen.hidden && performance.now() - shownAt > 250) nav.handle(f); },
  };
}
