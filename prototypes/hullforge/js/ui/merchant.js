// A wandering merchant (an encounter): fly alongside, press F. Buy parts rolled a little better than the system's
// outfitter (and a drone or two), sell spare parts for more than a station pays. Stock is rolled once per merchant.

import { el, btn, panel, tabs, toast, credits as cr, $ } from './dom.js';
import { itemCard } from './cards.js';
import { play } from '../core/audio.js';
import { ask } from '../../../../shared/dialog.js';
import { save, looseItems, designGrid } from '../sim/state.js';
import { rollLootItem, itemPrice, itemName } from '../sim/items.js';
import { makeDrone, droneName, dronePrice, droneLines, DRONE_IDS, DRONE_KINDS } from '../sim/drones.js';
import { rng, hash, clamp } from '../core/math.js';
import { RARITY } from '../data/blocks.js';

export const MERCHANT_MARKUP = 1.25;   // their parts cost 25% over a station's price
export const MERCHANT_BUYS = 0.4;      // they pay 40% of a part's price (a station pays 30%)

function stockOf(e, danger) {
  if (e.stock) return e.stock;
  const r = rng(hash(e.seed, 'stock'));
  const parts = []; for (let i = 0; i < 5; i++) parts.push(rollLootItem(hash(e.seed, 'p', i), clamp(danger + 1, 1, 6), 0.3));
  const drones = []; const nd = 1 + (r() < 0.5 ? 1 : 0);
  for (let i = 0; i < nd; i++) drones.push(makeDrone(DRONE_IDS[Math.floor(r() * DRONE_IDS.length)], clamp(Math.round(1 + (danger - 1) * 0.5), 1, 3), r() < 0.4 ? 2 : 1));
  e.stock = { parts, drones };
  return e.stock;
}
/** A drone as a card (the same look as an item card). */
export function droneCard(d, { price = null, actions = [], note = '' } = {}) {
  const r = RARITY[d.rarity] || RARITY[0];
  const card = el('div', { class: 'card', style: `border-top:3px solid ${r.color}` },
    el('div', { class: 'row between' }, el('h4', { style: `color:${r.color}` }, droneName(d)), price ? el('span', { class: 'price' }, price) : ''),
    el('span', { class: 'rar', style: `color:${r.color}` }, `${r.name} drone`), el('span', { class: 'dim' }, DRONE_KINDS[d.drone].blurb));
  const rows = el('div', { class: 'rows' }); for (const [a, b] of droneLines(d)) rows.append(el('span', {}, a), el('b', {}, b)); card.append(rows);
  if (note) card.append(el('span', { class: 'dim' }, note));
  if (actions.length) card.append(el('div', { class: 'row wrap' }, ...actions));
  return card;
}

export function openMerchant(app, e) {
  if ($('#panels .w-merchant')) return;
  const G = app.G; const sys = app.gal.systems[G.system]; const S = stockOf(e, sys.danger);
  const P = panel(e.body?.name?.split(',')[0] || 'Merchant', null, { cls: 'w-merchant', sub: 'Wandering merchant · moves on after a few minutes' });
  const credLine = el('div', { class: 'stat amber' }, cr(G.credits)); P.head.insertBefore(credLine, P.head.lastChild);
  const fitted = () => [...designGrid(G).cells.values()].filter(b => b.item).map(b => b.item);
  const T = tabs(P.body, [
    { id: 'buy', label: 'Buy', render(host) {
      const cards = el('div', { class: 'cards' }); host.append(cards);
      if (!S.parts.length && !S.drones.length) { host.append(el('p', { class: 'hint' }, 'Sold out.')); return; }
      for (const it of S.parts) {
        const price = Math.round(itemPrice(it) * MERCHANT_MARKUP / 10) * 10; const can = G.credits >= price;
        cards.append(itemCard(it, { fitted: fitted(), price: cr(price), why: can ? '' : `You need ${cr(price - G.credits)} more.`, actions: [btn('Buy', () => {
          if (G.credits < price) return; G.credits -= price; S.parts = S.parts.filter(x => x !== it); G.items.push(it);
          play('coin'); toast(`Bought ${itemName(it)}: fit it in a station's Shipyard.`, 'good'); save(G); credLine.textContent = cr(G.credits); T.redraw();
        }, can ? 'primary' : '', { disabled: !can })] }));
      }
      for (const d of S.drones) {
        const price = Math.round(dronePrice(d) * MERCHANT_MARKUP / 10) * 10; const can = G.credits >= price;
        cards.append(droneCard(d, { price: cr(price), note: 'Load it into a Drone bay at a station’s Drone hangar.', actions: [btn('Buy', () => {
          if (G.credits < price) return; G.credits -= price; S.drones = S.drones.filter(x => x !== d); G.drones.push(d);
          play('coin'); toast(`Bought ${droneName(d)}.`, 'good'); save(G); credLine.textContent = cr(G.credits); T.redraw();
        }, can ? 'primary' : '', { disabled: !can })] }));
      }
    } },
    { id: 'sell', label: 'Sell parts', render(host) {
      const loose = looseItems(G);
      if (!loose.length) { host.append(el('p', { class: 'hint' }, 'No spare parts to sell.')); return; }
      const cards = el('div', { class: 'cards' }); host.append(cards);
      for (const it of loose) {
        const price = Math.round(itemPrice(it) * MERCHANT_BUYS);
        cards.append(itemCard(it, { fitted: fitted(), price: cr(price), actions: [btn(`Sell for ${cr(price)}`, async () => {
          if (it.rarity >= 2 && !(await ask({ title: 'Sell this part?', text: `${itemName(it)} sells for ${cr(price)}.`, ok: 'Sell' }))) return;
          G.items = G.items.filter(x => x !== it); G.credits += price; G.stats.earned += price; play('coin'); save(G);
          credLine.textContent = cr(G.credits); T.redraw();
        })] }));
      }
    } },
  ]);
  return P;
}
