// Title: the logo over a live 3D line-up of your heroes on the village street (the real view, no picture), the main
// choices, the small extras row and the account pill. Continue picks up the last hero on the chapter map.
import { accountButton } from '../../../../shared/rgs-signin.js';
import { icon } from './icons.js';
import { esc, CLASS_NAMES } from './text.js';
import { randomLook } from './looks.js';
import { rng } from '../sim/rng.js';
import { starterGear } from '../sim/items.js';
import { soloParty } from './party.js';
import { hp as n } from '../../../../shared/format.js';

export function titleScreen(app) {
  const { save, data } = app;
  const last = app.hero(save.lastHero) || save.heroes[0] || null;
  const ch = last ? data.chapters.chapters[last.story.reached] : null;
  app.ui.innerHTML = `<section class="wr-title">
    <div class="wr-title-top">
      <div class="wr-acct-slot"></div>
      <button type="button" class="wr-icon-btn wr-menu-btn" data-act="menu" aria-label="Menu">${icon('menu')}</button>
    </div>
    <div class="wr-title-main">
      <header class="wr-logo"><h1>WYRMROAD</h1><p>The old road runs along a sleeping wyrm's back.</p></header>
      <nav class="wr-title-menu" aria-label="Main menu">
        ${last ? `<button type="button" class="wr-btn wr-big wr-primary" data-act="continue">${icon('play')}<span><b>Continue</b><small>${esc(last.name)} · level ${n(last.level)} ${esc(CLASS_NAMES[last.cls])} · ${esc(ch?.name || '')}</small></span></button>` : ''}
        <button type="button" class="wr-btn wr-big ${last ? '' : 'wr-primary'}" data-act="new">${icon('plus')}<span><b>New hero</b>${last ? '' : '<small>Make your hero and set off</small>'}</span></button>
        ${save.heroes.length ? `<button type="button" class="wr-btn wr-big" data-act="heroes">${icon('user')}<span><b>Heroes</b><small>${n(save.heroes.length)} saved</small></span></button>` : ''}
        <div class="wr-title-pair">
          <button type="button" class="wr-btn wr-big" data-act="local">${icon('people')}<span><b>Local co-op</b><small>2–4 on this screen</small></span></button>
          <button type="button" class="wr-btn wr-big" data-act="online">${icon('globe')}<span><b>Online co-op</b><small>Play with friends</small></span></button>
        </div>
      </nav>
      <div class="wr-title-extra">
        <button type="button" class="wr-btn wr-small" data-act="settings">${icon('cog')}<span>Settings</span></button>
        <button type="button" class="wr-btn wr-small wr-wn" data-act="whatsnew">${icon('scroll')}<span>What's new</span><i class="wr-dot" hidden></i></button>
        <button type="button" class="wr-btn wr-small" data-act="credits">${icon('star')}<span>Credits</span></button>
      </div>
    </div>
  </section>`;
  const root = app.ui.firstElementChild;
  root.querySelector('.wr-acct-slot').append(accountButton({ game: 'wyrmroad', gameName: 'Wyrmroad', onChange: u => { app.user = u || null; } }));
  const dot = root.querySelector('.wr-dot');
  const off = app.whatsNew.onUnread(n => { dot.hidden = !n; });

  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    app.audio.play('ui.click');
    switch (b.dataset.act) {
      case 'continue': app.party = soloParty(last); app.go('map', { heroId: last.id }); break;
      case 'new': app.go('creator', { then: 'map' }); break;
      case 'heroes': app.go('heroes'); break;
      case 'local': app.go('join'); break;
      case 'online': app.openOnline(); break;
      case 'settings': (await import('./menu.js')).openSettings(app); break;
      case 'whatsnew': app.whatsNew.open(); break;
      case 'credits': app.credits.open(); break;
      case 'menu': app.openMenu(); break;
    }
  });
  setTimeout(() => root.querySelector('.wr-primary')?.focus({ preventScroll: true }), 50);

  // the line-up: your heroes (newest first), or one of each class in a fresh look
  let cast = [...save.heroes].sort((a, b) => (b.created || 0) - (a.created || 0)).slice(0, 4);
  if (!cast.length) {
    const rand = rng(11);
    cast = ['vanguard', 'arcanist', 'duelist', 'warden'].map(cls => ({ name: CLASS_NAMES[cls], cls, level: 1, look: randomLook(data.classes, cls, rand), gear: starterGear(data.items, cls) }));
  }
  app.showcase(cast);
  app.audio.ambience('millbrook');
  return () => { off?.(); app.showcase(null); };
}
