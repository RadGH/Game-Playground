// The Peddler (gold sink, on the chapter map): an ARPG shop — the peddler's grid side by side with your bag. Pick
// anything to see its card next to what you wear (compare always on screen, game-standards §5b), then Buy or Sell.
// The stock is this chapter's gear for your class, rolled once per chapter you clear (the same visit shows the same
// wares). Prices: priceOf() — the one place a price comes from (the sell-back price is a share of it).
import { rollItem, rollRarity, baseOf, canUse, SLOTS } from '../sim/items.js';
import { rng } from '../sim/rng.js';
import { icon } from './icons.js';
import { esc, itemCardHtml, itemName, rarityColor, SLOT_NAMES } from './text.js';
import { openSheet } from './kit.js';
import { BAG_SIZE } from '../save.js';
import { hp as n } from '../../../../shared/format.js';

const RARITY_PRICE = { common: 1, fine: 1.9, rare: 3.6, storied: 6.5, legendary: 12 };
export const PRICE = { base: 36, perChapter: 0.55, sellShare: 0.25, stock: 7 };
/** What the peddler asks for an item. */
export function priceOf(ITEMS, it) {
  const b = baseOf(ITEMS, it); if (!b) return 0;
  const slotMul = b.slot === 'weapon' ? 1.3 : b.slot === 'trinket' ? 1.2 : 1;
  return Math.max(5, Math.round(PRICE.base * (1 + (b.chapter || 0) * PRICE.perChapter) * (RARITY_PRICE[it.rarity] || 1) * slotMul / 5) * 5);
}
/** What the peddler pays for it (salvage). */
export const sellPrice = (ITEMS, it) => Math.max(2, Math.round(priceOf(ITEMS, it) * PRICE.sellShare));

/** The peddler's wares for this hero now (rolled again after every chapter cleared). */
export function stockFor(data, h) {
  const turn = h.story.done.length + 1;
  if (h.shop?.turn === turn && h.shop.stock?.length) return h.shop.stock;
  const ch = h.story.reached, rand = rng((hash(h.id) ^ (turn * 2654435761)) >>> 0);
  const stock = [];
  const slots = SLOTS.filter(s => data.items.items.some(b => b.slot === s && b.cls.includes(h.cls) && !b.legendary));
  for (let i = 0; i < PRICE.stock; i++) {
    const slot = slots[(i + Math.floor(rand() * slots.length)) % slots.length];
    const rarity = rollRarity(data.items, ch, rand, 'fine');
    const it = rollItem(data.items, { chapter: ch, cls: h.cls, rand, slot, upTo: true, minRarity: rarity, uid: `shop${turn}_${i}_${h.id}` });
    if (it) stock.push(it);
  }
  h.shop = { turn, stock };
  return stock;
}
const hash = s => { let x = 2166136261; for (const c of String(s)) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); } return x >>> 0; };

export function openPeddler(app, h, { onChange = null } = {}) {
  const { data } = app;
  let sel = null;            // { from: 'shop' | 'bag', uid }
  const sh = openSheet({ title: 'The Peddler', wide: true, cls: 'wr-peddler', body: '<div class="wr-shop"></div>' });
  const root = sh.body.querySelector('.wr-shop');
  stockFor(data, h); app.saveNow(false);

  const cell = (it, from) => {
    const b = baseOf(data.items, it), ok = canUse(data.items, h.cls, it);
    return `<button type="button" class="wr-cell${sel?.uid === it.uid ? ' on' : ''}${ok ? '' : ' wr-cell-off'}" data-from="${from}" data-uid="${esc(it.uid)}" style="--rar:${rarityColor(data.items, it)};--tint:${b?.look ? Object.values(b.look)[0]?.color || '#999' : '#999'}" ${b ? `data-icon-base="${esc(b.id)}"` : ''} aria-label="${esc(itemName(data.items, it))}">${icon(b?.slot || 'bag')}${from === 'shop' ? `<small>${n(priceOf(data.items, it))}</small>` : ''}</button>`;
  };
  function draw() {
    const stock = h.shop.stock, it = sel && (sel.from === 'shop' ? stock : h.bag).find(x => x.uid === sel.uid);
    const b = it && baseOf(data.items, it), worn = b ? h.gear[b.slot] : null;
    const price = it ? (sel.from === 'shop' ? priceOf(data.items, it) : sellPrice(data.items, it)) : 0;
    const can = it && sel.from === 'shop' ? (h.gold >= price ? (h.bag.length < BAG_SIZE ? '' : 'Your bag is full') : `You need ${n(price - h.gold)} more gold`) : '';
    root.innerHTML = `<div class="wr-shop-gold">${icon('gold')}<b>${n(h.gold)}</b><span>gold</span></div>
      <div class="wr-shop-cols">
        <section class="wr-shop-side"><h3>${icon('shop')}Wares <small>new stock after each chapter</small></h3>${stock.length ? `<div class="wr-grid">${stock.map(x => cell(x, 'shop')).join('')}</div>` : '<p class="wr-dim">Sold out until you clear a chapter.</p>'}</section>
        <section class="wr-shop-side"><h3>${icon('bag')}Your bag <small>${n(h.bag.length)} of ${n(BAG_SIZE)}</small></h3>${h.bag.length ? `<div class="wr-grid">${h.bag.map(x => cell(x, 'bag')).join('')}</div>` : '<p class="wr-dim">Empty. Things you find on the road go here.</p>'}</section>
      </div>
      <div class="wr-shop-detail">${it ? `
        <div class="wr-compare">
          <div><h4>${sel.from === 'shop' ? 'For sale' : 'In your bag'}</h4>${itemCardHtml(data.items, it, { cls: h.cls, vs: worn && worn.uid !== it.uid ? worn : null, price, priceLabel: sel.from === 'shop' ? 'Price' : 'Sells for' })}</div>
          <div><h4>You wear (${esc(SLOT_NAMES[b.slot])})</h4>${itemCardHtml(data.items, worn, { cls: h.cls })}</div>
        </div>
        <div class="wr-shop-acts">${sel.from === 'shop'
          ? `<button type="button" class="wr-btn wr-primary" data-act="buy" ${can ? 'disabled' : ''}>${icon('gold')}<span>Buy for ${n(price)} gold</span></button>${can ? `<p class="wr-why">${esc(can)}</p>` : ''}`
          : `<button type="button" class="wr-btn" data-act="sell">${icon('gold')}<span>Sell for ${n(price)} gold</span></button>`}</div>`
        : '<p class="wr-dim wr-shop-hint">Pick something from the wares or your bag to see it beside what you wear.</p>'}</div>`;
    app.render?.paintItemIcons(root, data);      // optional: no 3D view → the tinted slot glyphs stay
  }
  root.addEventListener('click', e => {
    const c = e.target.closest('[data-uid]');
    if (c) { sel = { from: c.dataset.from, uid: c.dataset.uid }; app.audio.play('ui.click'); draw(); root.querySelector('[data-act]')?.focus({ preventScroll: true }); return; }
    const a = e.target.closest('[data-act]'); if (!a || !sel) return;
    if (a.dataset.act === 'buy') {
      const i = h.shop.stock.findIndex(x => x.uid === sel.uid), it = h.shop.stock[i], p = priceOf(data.items, it);
      if (h.gold < p || h.bag.length >= BAG_SIZE) return;
      h.gold -= p; h.shop.stock.splice(i, 1);
      const owned = { ...it, uid: `b${Date.now().toString(36)}${i}` };
      h.bag.push(owned); sel = { from: 'bag', uid: owned.uid };
      app.audio.play('coin'); app.note(`Bought ${itemName(data.items, it)}.`);
    } else if (a.dataset.act === 'sell') {
      const i = h.bag.findIndex(x => x.uid === sel.uid), it = h.bag[i], p = sellPrice(data.items, it);
      h.bag.splice(i, 1); h.gold += p; sel = null;
      app.audio.play('coin'); app.note(`Sold ${itemName(data.items, it)} for ${n(p)} gold.`);
    }
    app.saveNow(); onChange?.(); draw();
  });
  draw();
  return sh;
}
