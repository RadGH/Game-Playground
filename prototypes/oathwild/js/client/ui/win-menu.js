// The ☰ menu (Esc / Start / the ☰ button in the world; also on the title): back to the game, your character's
// windows, settings and controls, What's new, report a bug, rate the game, credits, sign in or out, leave the world.
// opts.where = 'play' (in a world) | 'title' — the world-only rows are left out on the title.
import { openWin, esc, ask, closeAll } from './kit.js';
import { glyph, uiIcon } from './icons.js';
import { hintFor } from '../input/bindings.js';
import { createCredits } from '../../../../../shared/credits.js';
import { account } from '../../../../../shared/rgs-account.js';
import { openSignIn } from '../../../../../shared/rgs-signin.js';

const CHAR = [['bag', 'Bag', 'bag', 'bag'], ['sheet', 'Character', 'sheet', 'sheet'], ['classes', 'Classes', 'skills', 'classes'], ['talents', 'Talents', 'perks', 'talents'], ['spellbook', 'Spellbook', 'journal', 'spellbook'], ['quests', 'Quests', 'callboard', 'quests'], ['trade', 'Trade skills', 'prof_enchanting', 'trade'], ['map', 'Map', 'map', 'map']];
let credits = null;

export function open(app, opts = {}) {
  const where = opts.where || (app.screenName === 'play' && app.world ? 'play' : 'title');
  const w = openWin({
    id: 'menu', title: 'Menu', size: 'narrow', cls: 'ow-menu',
    render(body) {
      const user = account.known || null;
      const dev = app.device || 'keys';
      const row = (act, icon, label, extra = '') => `<button type="button" class="ow-menu-row" data-m="${act}">${icon}<span>${esc(label)}</span>${extra}</button>`;
      body.innerHTML = `
        ${where === 'play' ? `<button type="button" class="ow-btn ow-primary ow-menu-resume" data-m="resume" data-primary>${glyph('next', 18)}<span>Back to the game</span></button>
        <div class="ow-menu-grid">${CHAR.map(([id, label, icon, action]) => {
          const k = hintFor(app.bindings, action, dev);
          const dot = id === 'sheet' && app.me?.pending ? '<span class="ow-menu-dot" aria-label="Level up waiting"></span>' : '';
          return `<button type="button" class="ow-menu-tile" data-win="${id}">${uiIcon(icon, 28)}<span>${esc(label)}</span>${k ? `<span class="ow-key">${esc(k)}</span>` : ''}${dot}</button>`;
        }).join('')}</div>` : ''}
        <div class="ow-menu-list">
          ${row('settings', glyph('gear', 20), 'Settings')}
          ${row('controls', glyph(dev === 'pad' ? 'pad' : 'keyboard', 20), 'Controls')}
          ${row('news', glyph('news', 20), "What's new", app.news?.unread ? '<span class="ow-menu-dot"></span>' : '')}
          ${row('report', uiIcon('feedback', 20), 'Report a bug')}
          ${row('rate', glyph('star', 20), 'Rate the game')}
          ${row('credits', glyph('info', 20), 'Credits')}
          ${row('account', glyph('people', 20), user ? `Signed in as ${user.username || user.name || 'you'} — sign out` : 'Sign in (optional)')}
          ${where === 'play' ? row('leave', glyph('door', 20), 'Leave the world') : ''}
        </div>`;
      body.querySelectorAll('[data-win]').forEach(b => { b.onclick = () => { w.close(); app.openWindow(b.dataset.win); }; });
      body.querySelectorAll('[data-m]').forEach(b => { b.onclick = () => act(b.dataset.m); });
    },
  });
  async function act(m) {
    if (m === 'resume') return w.close();
    if (m === 'settings') return app.openWindow('settings');
    if (m === 'controls') return app.openWindow('controls');
    if (m === 'news') return app.news?.open();
    if (m === 'report') { w.close(); return app.openWindow('report'); }
    if (m === 'rate') return app.openWindow('rate');
    if (m === 'credits') { credits = credits || createCredits({ game: 'oathwild', made: 'Oathwild by Radley Sustaire.' }); return credits.open(); }
    if (m === 'account') {
      const user = await account.user().catch(() => null);
      if (user) {
        if (await ask({ title: 'Sign out?', text: 'Your characters stay on your account. On this device you play with its own characters until you sign in again.', ok: 'Sign out', cancel: 'Stay signed in' })) { await account.signOut().catch(() => {}); app.toast('Signed out.'); }
      } else {
        const u = await openSignIn({ game: 'oathwild', gameName: 'Oathwild' });
        if (u) app.toast(`Signed in as ${u.username || u.name}. Your characters follow your account from now on.`, 'good', 4000);
      }
      // the server learns who this is when the line says hello again
      if (app.net && !app.world) { app.net.close(); app.net.connect().catch(() => {}); }
      if (w.open) w.render();
      return;
    }
    if (m === 'leave') {
      if (!(await ask({ title: 'Leave the world?', text: 'Your hero and the world are saved. Anyone still playing carries on without you.', ok: 'Leave', cancel: 'Stay' }))) return;
      app.net?.send({ t: 'leave' });
      if (app.net) { app.net.world = null; app.net.char = null; }
      app.world = null;
      closeAll();
      app.go('worlds');
    }
  }
  return w;
}
