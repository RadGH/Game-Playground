// The loot window (owner: items never drop on the ground — they are taken from corpses, chests and bags in a window;
// gold must be taken). Every player sees only their OWN share, rolled for them. The world stays visible behind it
// (right side on a desktop, a bottom sheet on a phone). Opened by the play screen with the server's 'win' message.
//
//   app.openWindow('loot', { id, name, allowed, why, gold, items, quest })   → .win-loot  (.loot-row[data-item], [data-act="all"])
import { openWin, esc } from './kit.js';
import { glyph } from './icons.js';
import { itemCell } from './win-bag.js';
import { fmt } from '../../../../../shared/format.js';

export function open(app, opts = {}) {
  app.lastLoot = opts;
  const w = openWin({
    id: 'loot', title: opts.name || 'Remains', cls: 'win-loot', size: 'narrow', clear: true,
    render: (body, tab, w) => render(app, body, w),
    foot: (el, w) => foot(app, el, w),
    onClose: () => { if (app.lastLoot?.id) app.act('loot-close', { id: app.lastLoot.id }); app.lastLoot = null; },
  });
  w.heading = opts.name || 'Remains';     // a second box opened while one is showing: its own name
  w.data.box = opts;
  w.render();
  // the first useful button: Take all (lessons rule 27)
  (w.el.querySelector('[data-act="all"]') || w.el.querySelector('.loot-row [data-act="take"]'))?.focus?.({ preventScroll: true });
  return w;
}

function render(app, body, w) {
  const L = w.data.box || app.lastLoot || {};
  app.lastLoot = L;
  if (!L.allowed) return `<div class="loot-none"><p><b>Nothing in here is yours.</b></p><p class="ow-dim">${esc(L.why || 'Only those who helped get a share.')}</p></div>`;
  const rows = [];
  if (L.gold) rows.push(`<div class="loot-row loot-gold"><span class="bag-ico">${glyph('coin', 26)}</span><span class="bag-txt"><b class="ow-gold">${fmt(L.gold)} gold</b><small>Gold has to be picked up</small></span><button type="button" class="ow-btn ow-small" data-act="gold">Take gold</button></div>`);
  for (const it of L.items || []) {
    rows.push(`<div class="loot-row" data-item="${esc(it.id)}">${itemCell(it, `loot:${L.id}:${it.id}`, { cls: 'loot-cell' })}<button type="button" class="ow-btn ow-small" data-act="take" data-id="${esc(it.id)}">Take</button></div>`);
  }
  if (!rows.length) return `<p class="ow-empty">${L.quest ? 'Taken.' : 'Empty — you took everything that was yours.'}</p>`;
  return `<div class="loot-list">${rows.join('')}</div>`;
}

function foot(app, el, w) {
  const L = w.data.box || {};
  const any = L.allowed && (L.gold || (L.items || []).length);
  el.innerHTML = `${any ? `<button type="button" class="ow-btn ow-primary" data-act="all" data-primary>${glyph('check', 18)}Take all</button>` : ''}<button type="button" class="ow-btn ow-ghost" data-act="close">Close</button>`;
  const go = (a, extra = {}) => app.act(a, { id: L.id, ...extra });
  el.querySelector('[data-act="all"]')?.addEventListener('click', () => { go('loot-all'); app.sfx('loot.normal'); });
  el.querySelector('[data-act="close"]').onclick = () => w.close();
  w.body.querySelector('[data-act="gold"]')?.addEventListener('click', () => { go('loot-gold'); app.sfx('coin'); });
  w.body.querySelectorAll('[data-act="take"]').forEach(b => { b.onclick = () => { go('loot-take', { item: b.dataset.id }); app.sfx('loot.common'); }; });
  // a click on the item itself takes it too (one step less with a mouse)
  w.body.querySelectorAll('.loot-cell').forEach(b => { b.onclick = () => b.parentElement.querySelector('[data-act="take"]')?.click(); });
}
