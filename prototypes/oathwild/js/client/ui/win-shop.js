// A shop (server 'win' kind 'shop'): the seller's goods as a grid like your bag, side by side with your own bag
// (game-standards: an ARPG shop is a grid like your bag). LOOK, THEN BUY (owner 2026-11-25: "Shops instantly purchase
// items on mobile so you can't read their description"): a tap / click / the pad's A on any item only picks it; the
// details pane shows the one item card (the tooltip's own, with the compare against what you wear and the price) and
// the one button that commits — "Buy — N gold" for the seller's goods, "Sell — N gold" for yours — greyed with the
// reason when your gold is short. A rare or better asks before it is sold. Desktop: the pane is a column beside the
// grids; phone: it is pinned at the bottom of the window. kind 'repair' goes to the repair window.
import { openWin, ask, findWin } from './kit.js';
import { itemCell, goldOf, wirePick, dropGonePick, pickFoot, pickRef, cellTips, pickWatch } from './win-services.js';
import { open as openService } from './win-services.js';
import { itemCardHtml } from './tip.js';
import { sellPrice } from '../../game/gear.js';
import { fmt } from '../../../../../shared/format.js';
import { glyph } from './icons.js';

const GOOD = new Set(['rare', 'legendary', 'unique']);

export function open(app, opts = {}) {
  if (opts.kind === 'repair') return openService(app, opts);
  app.lastShop = opts;
  const fresh = !findWin('shop');
  const w = openWin({
    id: 'shop', title: opts.name || 'Shop', sub: 'Buy and sell', size: 'wide', cls: 'ow-shop ow-pickwin',
    render(body, tab, w) {
      const d = app.lastShop || opts;
      const c = app.me?.char; if (!c) return '';
      const gold = goldOf(app);
      const stock = d.stock || [];
      const bag = c.bag || [];
      dropGonePick(w, [...stock.map(s => `buy:shop:${s.item.id}`), ...bag.map(it => `sell:bag:${it.id}`)]);
      const tip = cellTips(app);
      body.innerHTML = `<div class="ow-shop-cols">
        <section class="ow-shop-col"><h3>${glyph('coin', 18)} For sale <span class="ow-shop-n">${fmt(stock.length)}</span></h3>
          ${stock.length ? `<div class="ow-shop-grid">${stock.map(s => itemCell(s.item, { ref: `shop:${s.item.id}`, price: s.price, pick: `buy:shop:${s.item.id}`, sel: w.data.sel === `buy:shop:${s.item.id}`, disabled: gold < s.price, why: gold < s.price ? `${fmt(s.price - gold)} gold short` : '', tip })).join('')}</div>` : '<p class="ow-empty">Sold out. New goods come in every half hour.</p>'}
        </section>
        <section class="ow-shop-col"><h3>${glyph('weight', 18)} Your bag <span class="ow-shop-n">${fmt(bag.length)}</span></h3>
          ${bag.length ? `<div class="ow-shop-grid">${bag.map(it => itemCell(it, { ref: `bag:${it.id}`, price: sellPrice(app.rules, c, it), sell: true, pick: `sell:bag:${it.id}`, sel: w.data.sel === `sell:bag:${it.id}`, tip })).join('')}</div>` : '<p class="ow-empty">Your bag is empty.</p>'}
        </section></div>`;
      wirePick(app, w, body);
    },
    foot(f, w) {
      const d = app.lastShop || opts;
      const c = app.me?.char; if (!c) return;
      const gold = goldOf(app);
      const k = w.data.sel, ref = pickRef(k);
      let card = '', act = null;
      if (k?.startsWith('buy:')) {
        const s = (d.stock || []).find(x => `shop:${x.item.id}` === ref);
        if (s) {
          const short = gold < s.price;
          card = itemCardHtml(app, ref, { price: s.price });
          act = { label: `Buy — ${fmt(s.price)} gold`, sub: short ? `${fmt(s.price - gold)} gold short` : '', disabled: short, icon: glyph('coin', 18), run: () => app.act('buy', { npc: d.npc, item: s.item.id }) };
        }
      } else if (k?.startsWith('sell:')) {
        const it = (c.bag || []).find(x => `bag:${x.id}` === ref);
        if (it) {
          const price = sellPrice(app.rules, c, it);
          card = itemCardHtml(app, ref, { price, sell: true });
          act = {
            label: `Sell — ${fmt(price)} gold`, icon: glyph('coin', 18),
            run: async () => {
              // worth asking only for something good: a rare or better (shops do not buy back)
              if (GOOD.has(it.rarity) && !(await ask({ title: `Sell ${it.name}?`, text: `For ${fmt(price)} gold. Shops do not buy things back.`, ok: 'Sell it', cancel: 'Keep it' }))) return;
              app.act('sell', { npc: d.npc, item: it.id });
            },
          };
        }
      }
      pickFoot(app, f, w, { card, act, empty: 'Pick an item to see it here, then buy or sell it.' });
    },
    onClose() { app.lastShop = null; },
  });
  return pickWatch(app, w, fresh);
}
