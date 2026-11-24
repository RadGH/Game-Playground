// A shop (server 'win' kind 'shop'): the seller's goods as a grid like your bag, side by side with your own bag
// (game-standards: an ARPG shop is a grid like your bag). Buy shows its price and is greyed with the reason when your
// gold is short; selling is a click on your own item, at the price written on it. Every item has the one tooltip
// (with the compare against what you wear). kind 'repair' goes to the repair window.
import { openWin, esc, ask, findWin } from './kit.js';
import { itemCell, live, goldLine, goldOf } from './win-services.js';
import { open as openService } from './win-services.js';
import { sellPrice } from '../../game/gear.js';
import { fmt } from '../../../../../shared/format.js';
import { glyph } from './icons.js';

export function open(app, opts = {}) {
  if (opts.kind === 'repair') return openService(app, opts);
  app.lastShop = opts;
  const w = openWin({
    id: 'shop', title: opts.name || 'Shop', sub: 'Buy and sell', size: 'wide', cls: 'ow-shop',
    render(body) {
      const d = app.lastShop || opts;
      const c = app.me?.char; if (!c) return '';
      const gold = goldOf(app);
      const stock = d.stock || [];
      const bag = c.bag || [];
      body.innerHTML = `<div class="ow-shop-cols">
        <section class="ow-shop-col"><h3>${glyph('coin', 18)} For sale</h3>
          ${stock.length ? `<div class="ow-shop-grid">${stock.map(s => itemCell(s.item, { ref: `shop:${s.item.id}`, price: s.price, act: `data-buy="${esc(s.item.id)}"`, disabled: gold < s.price, why: gold < s.price ? `${fmt(s.price - gold)} gold short` : '' })).join('')}</div>` : '<p class="ow-empty">Sold out. New goods come in every half hour.</p>'}
        </section>
        <section class="ow-shop-col"><h3>${glyph('weight', 18)} Your bag</h3>
          ${bag.length ? `<div class="ow-shop-grid">${bag.map(it => itemCell(it, { ref: `bag:${it.id}`, price: sellPrice(app.rules, c, it), sell: true, act: `data-sell="${esc(it.id)}"`, extra: '<span class="ow-wcell-act">Sell</span>' })).join('')}</div>` : '<p class="ow-empty">Your bag is empty.</p>'}
        </section></div>`;
      body.querySelectorAll('[data-buy]').forEach(b => {
        b.onclick = () => {
          const s = stock.find(x => x.item.id === b.dataset.buy);
          if (!s) return;
          if (goldOf(app) < s.price) { app.toast(`That costs ${fmt(s.price)} gold; you have ${fmt(goldOf(app))}.`, 'bad'); return; }
          app.act('buy', { npc: d.npc, item: s.item.id });
        };
      });
      body.querySelectorAll('[data-sell]').forEach(b => {
        b.onclick = async () => {
          const it = (app.me?.char?.bag || []).find(x => x.id === b.dataset.sell);
          if (!it) return;
          // worth asking only for something good: a rare or better, or worth a lot more than it sells for
          if ((it.rarity === 'rare' || it.rarity === 'legendary' || it.rarity === 'unique') && !(await ask({ title: `Sell ${it.name}?`, text: `For ${fmt(sellPrice(app.rules, app.me.char, it))} gold. Shops do not buy things back.`, ok: 'Sell it', cancel: 'Keep it' }))) return;
          app.act('sell', { npc: d.npc, item: it.id });
        };
      });
    },
    foot(f) { f.innerHTML = `${goldLine(app)}<span class="ow-spacer"></span><button type="button" class="ow-btn" data-done>Done</button>`; f.querySelector('[data-done]').onclick = () => findWin('shop')?.close(); },
    onClose() { app.lastShop = null; },
  });
  w.render();
  return live(app, w);
}
