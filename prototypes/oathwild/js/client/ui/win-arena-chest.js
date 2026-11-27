// Your reward chest after an arena win (brainstorm 2026-11-27 §2d: individual loot — every hero has their own). What
// was won (the bracket, a first clear, a champion's title), the gold, and every item as its FULL card inline (the same
// card the tooltip shows — lessons rule 10, phones included), each with Take; Take all in the footer.
//
//   app.openWindow('arena-chest', { id, name, bracket, champion, first, gold, items, newTitle, xp, left }) → .win-arena-chest
import { openWin, esc } from './kit.js';
import { glyph } from './icons.js';
import { itemCardHtml } from './tip.js';
import { fmt } from '../../../../../shared/format.js';

export function open(app, data = {}) {
  app.itemCache = app.itemCache || new Map();
  for (const it of data.items || []) app.itemCache.set(it.id, it);
  const w = openWin({
    id: 'arena-chest', title: 'Reward chest', cls: 'win-arena-chest', size: 'narrow',
    render: (body, t, w) => render(app, w.data.c, w),
    foot: (el, w) => foot(app, w.data.c, el, w),
  });
  w.data.c = data;
  w.sub = data.name || '';
  w.render();
  (w.el.querySelector('[data-act="all"]') || w.el.querySelector('[data-act="take"]'))?.focus?.({ preventScroll: true });
  return w;
}

function render(app, c, w) {
  if (!c) return '';
  const head = [];
  if (c.champion) head.push(`<div class="ac-banner champ">${glyph('star', 22)}<span><b>${c.newTitle ? `You are now called ${esc(c.newTitle)}` : 'A rematch won'}</b><small>${c.newTitle ? 'Shown with your name · change it on the board’s Champions tab' : 'Gold and experience — the title and item came the first time'}</small></span></div>`);
  else if (c.first) head.push(`<div class="ac-banner first">${glyph('check', 22)}<span><b>First clear!</b><small>One more piece, a magic one or better for sure, and extra gold</small></span></div>`);
  if (c.xp) head.push(`<p class="ac-xp">+${fmt(c.xp)} experience</p>`);
  const rows = [];
  if (c.gold) rows.push(`<div class="ac-gold">${glyph('coin', 26)}<b class="ow-gold">${fmt(c.gold)} gold</b><button type="button" class="ow-btn ow-small" data-act="gold">Take gold</button></div>`);
  for (const it of c.items || []) rows.push(`<div class="ac-item rarity-${esc(it.isUnique ? 'unique' : it.rarity || 'normal')}">${itemCardHtml(app, `item:${it.id}`)}<button type="button" class="ow-btn ow-small" data-act="take" data-id="${esc(it.id)}">${glyph('check', 16)}<span>Take</span></button></div>`);
  if (!rows.length) { setTimeout(() => { if (w.open && w.data.c === c) w.close(); }, 400); return `${head.join('')}<p class="ow-empty">You took everything.${c.left ? ` ${fmt(c.left)} more chest${c.left > 1 ? 's' : ''} by the board.` : ''}</p>`; }
  return `${head.join('')}<div class="ac-list">${rows.join('')}</div>`;
}

function foot(app, c, el, w) {
  const any = c && (c.gold || (c.items || []).length);
  el.innerHTML = `<button type="button" class="ow-btn ow-ghost" data-act="close">Close</button>${any ? `<button type="button" class="ow-btn ow-primary" data-act="all" data-primary>${glyph('check', 18)}<span>Take all</span></button>` : ''}`;
  const go = (a, extra = {}) => app.act(a, { id: c.id, ...extra });
  el.querySelector('[data-act="close"]').onclick = () => w.close();
  el.querySelector('[data-act="all"]')?.addEventListener('click', () => { go('loot-all'); app.sfx('loot.normal'); });
  w.body.querySelector('[data-act="gold"]')?.addEventListener('click', () => { go('loot-gold'); app.sfx('coin'); });
  w.body.querySelectorAll('[data-act="take"]').forEach(b => { b.onclick = () => { go('loot-take', { item: b.dataset.id }); app.sfx('loot.common'); }; });
}
