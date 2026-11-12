// The wandering merchant (PLAN §E1 E6): a trader you dock with in open space. Sells a few rare-and-better parts
// (encounters.js merchantStock) and buys your parts for a little more than an outfitter pays. Same item cards as
// the station shops (ui/items.js itemCard). The game pauses while the panel is open, like the maps.

import { panel, el, btn, toast, fmt } from './dom.js';
import { itemCard } from './items.js';
import { itemValue } from '../sim/loot.js';
import { RARITY_BY_ID } from '../data/types.js';
import { merchantStock, merchantBought } from '../sim/encounters.js';
import { play } from '../core/audio.js';

const SELL_MARKUP = 1.35;   // their prices, against the station list price (itemValue / 0.35)
const BUY_RATE = 1.2;       // what they pay for your parts, against itemValue (an outfitter pays 1.0)

export function openMerchant(app, e) {
  const G = app.G; if (!G || app.mode !== 'fly') return;
  app.mode = 'paused';
  const ship = e.ships[0];
  const p = panel(e.name || 'Wandering merchant', () => { if (app.mode === 'paused') app.mode = 'fly'; }, { closeLabel: 'Leave', cls: 'station' });
  const info = el('div', { class: 'st-info' });
  p.head.insertBefore(info, p.head.children[1]);
  const tabsBar = el('div', { class: 'tabs st-tabs' });
  const content = el('div', { class: 'st-content' });
  p.body.append(tabsBar, content);
  const stock = merchantStock(e);
  let tab = 'buy';
  function render() {
    const scroll = p.body.scrollTop;
    info.innerHTML = '';
    info.append(el('span', { class: 'stat amber' }, `${fmt(G.credits)} cr`), el('span', { class: 'stat' }, `${fmt(G.parts.length)} part${G.parts.length === 1 ? '' : 's'} in your hold`));
    tabsBar.innerHTML = '';
    for (const [id, label] of [['buy', 'Their wares'], ['sell', 'Sell parts']]) tabsBar.append(btn(label, () => { tab = id; render(); p.body.scrollTop = 0; }, id === tab ? 'on' : ''));
    content.innerHTML = '';
    if (tab === 'buy') {
      content.append(el('h3', { class: 'st-h' }, 'Rare finds'), el('p', { class: 'hint' }, `Rare and better parts from all over. They will be gone when ${ship?.name || 'the merchant'} moves on.`));
      const cards = el('div', { class: 'cards' });
      stock.forEach((it, i) => {
        if (e.bought.includes(i)) return;
        const price = Math.round(itemValue(it) / 0.35 * SELL_MARKUP);
        cards.append(itemCard(it, { compact: true, price, actions: [btn('Buy', () => {
          if (G.credits < price) return toast('You cannot afford that.', 'bad');
          G.credits -= price; G.parts.push(it); merchantBought(app.w, e, i); play('coin');
          toast(`Bought ${it.name}. It is in your parts hold.`, 'good', RARITY_BY_ID[it.rarity]?.color); app.save?.(); render();
        }, G.credits >= price ? 'primary' : '')] }));
      });
      if (!cards.children.length) cards.append(el('p', { class: 'hint' }, 'You bought everything they had.'));
      content.append(cards);
    } else {
      content.append(el('h3', { class: 'st-h' }, 'Your parts'), el('p', { class: 'hint' }, G.parts.length ? 'They pay a fifth more than an outfitter. Fitted parts are not shown.' : 'Your parts hold is empty.'));
      const cards = el('div', { class: 'cards' });
      for (const it of G.parts) {
        const v = Math.round(itemValue(it) * BUY_RATE);
        cards.append(itemCard(it, { compact: true, price: v, priceLabel: 'They pay', actions: [btn('Sell', () => { G.parts.splice(G.parts.indexOf(it), 1); G.credits += v; play('coin'); toast(`Sold ${it.name} for ${fmt(v)} cr`, 'good'); app.save?.(); render(); })] }));
      }
      content.append(cards);
    }
    p.body.scrollTop = scroll;
  }
  render();
  return p;
}
