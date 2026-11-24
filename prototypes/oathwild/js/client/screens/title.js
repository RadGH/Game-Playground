// The title: a menu, nothing more (lessons rule 13). Play leads to the character select; the small buttons hold
// What's new (with its unread dot), Settings and Credits; the ☰ menu owns the top-left corner and the account pill the
// top-right. A small dot at the bottom says whether the world server can be reached, in plain words.
// The backdrop is painted in CSS (a dusk sky over two ridges) — cheap on every device.
import { uiIcon, glyph } from '../ui/icons.js';
import { accountButton } from '../../../../../shared/rgs-signin.js';
import { createCredits } from '../../../../../shared/credits.js';

export async function show(app) {
  const ui = document.getElementById('ui');
  ui.innerHTML = `<section class="scr-title" aria-label="Oathwild">
    <div class="scr-title-sky" aria-hidden="true"><i class="scr-title-sun"></i><i class="scr-title-ridge scr-title-ridge-far"></i><i class="scr-title-ridge scr-title-ridge-near"></i></div>
    <button type="button" class="ow-x scr-title-menu" data-act="menu" aria-label="Menu">${uiIcon('menu', 24)}</button>
    <div class="scr-title-account"></div>
    <div class="scr-title-main">
      <h1 class="scr-title-name">Oathwild</h1>
      <p class="scr-title-tag">Brightwater Vale is waking. The old oaths are not.</p>
      <button type="button" class="ow-btn ow-primary scr-title-play" data-act="play">${glyph('next', 22)}<span>Play</span></button>
      <div class="scr-title-small"></div>
    </div>
    <p class="scr-title-conn" role="status"><i class="scr-title-dot"></i><span></span></p>
  </section>`;
  const root = ui.firstElementChild;
  const small = root.querySelector('.scr-title-small');
  if (app.news) { const b = app.news.button({ label: "What's new" }); b.classList.add('ow-btn', 'ow-small', 'ow-ghost', 'scr-title-news'); b.dataset.act = 'whatsnew'; small.append(b); }
  const settings = document.createElement('button');
  settings.type = 'button'; settings.className = 'ow-btn ow-small ow-ghost'; settings.dataset.act = 'settings';
  settings.innerHTML = `${glyph('gear', 18)}<span>Settings</span>`;
  small.append(settings);
  const credits = createCredits({ game: 'oathwild', title: 'Credits', made: 'Oathwild — an independent game by Radley Sustaire.' });
  const cb = document.createElement('button');
  cb.type = 'button'; cb.className = 'ow-btn ow-small ow-ghost'; cb.dataset.act = 'credits';
  cb.innerHTML = `${glyph('scroll', 18)}<span>Credits</span>`;
  cb.addEventListener('click', () => credits.open());
  small.append(cb);
  try { root.querySelector('.scr-title-account').append(accountButton({ game: 'oathwild', gameName: 'Oathwild' })); } catch (e) { console.warn('account button', e); }

  root.addEventListener('click', e => {
    const t = e.target.closest('[data-act]'); if (!t) return;
    if (t.dataset.act === 'play') app.go('chars');
    else if (t.dataset.act === 'settings') app.openWindow('settings');
    else if (t.dataset.act === 'menu') app.openWindow('menu', { where: 'title' });
  });

  const conn = root.querySelector('.scr-title-conn');
  const drawConn = () => {
    const s = app.net?.state;
    conn.dataset.state = s === 'open' ? 'ok' : s === 'connecting' ? 'wait' : 'down';
    conn.querySelector('span').textContent = s === 'open' ? 'World server ready' : s === 'connecting' ? 'Reaching the world server…' : 'Can\'t reach the world server — retrying';
  };
  drawConn();
  const off = app.net?.on('state', drawConn);
  setTimeout(() => root.querySelector('[data-act="play"]')?.focus({ preventScroll: true }), 30);
  return { view: 'ready', close() { off?.(); credits.close(); } };
}
