// The hold: spare parts (fit them in the Shipyard at any station), parts on the ship, and ore.

import { el, btn, panel, tabs, num, credits as cr } from './dom.js';
import { itemCard } from './cards.js';
import { looseItems, designGrid, cargoUsed } from '../sim/state.js';
import { computeStats } from '../sim/stats.js';
import { ORES } from '../data/blocks.js';
import { GOODS } from '../sim/economy.js';   // economy: trade goods share the hold
import { $ } from './dom.js';

export function openHold(app) {
  if ($('#panels .hold-panel')) { $('#panels .hold-panel').closePanel(); return; }
  const G = app.G;
  const P = panel('Hold', null, { cls: 'hold-panel', sub: app.mode === 'docked' ? 'Fit parts in the Shipyard' : 'Parts are fitted at a station’s Shipyard' });
  const fittedItems = () => [...designGrid(G).cells.values()].filter(b => b.item).map(b => b.item);
  tabs(P.body, [
    { id: 'spare', label: `Spare parts (${num(looseItems(G).length)})`, render(host) {
      const loose = looseItems(G).sort((a, b) => b.rarity - a.rarity || b.tier - a.tier);
      if (!loose.length) { host.append(el('p', { class: 'hint' }, 'No spare parts. Enemies drop them; outfitters sell them.')); return; }
      const c = el('div', { class: 'cards' }); host.append(c);
      for (const it of loose) c.append(itemCard(it, { fitted: fittedItems() }));
    } },
    { id: 'fitted', label: 'On your ship', render(host) {
      const st = computeStats(designGrid(G));
      host.append(el('div', { class: 'section', style: 'max-width:820px' }, el('h3', {}, G.shipName), el('div', { class: 'kv', style: 'max-width:420px' },
        ...[['Blocks', `${num(st.blocks)} of ${num(st.maxBlocks)}`], ['Rating', num(st.rating)], ['Hull', num(st.maxHp)], ['Shield', num(st.shield)], ['Damage per second', num(st.dps)], ['Top speed', `${num(st.maxSpeed)} m/s`], ['Turning', `${num(st.turn * 57.3)}° per second`], ['Power', `${num(st.powerMade)} made / ${num(st.powerUse)} used`], ['Auto-aim turrets', `${num(Math.min(st.auto, st.turrets.length))} of ${num(st.turrets.length)}`]].flatMap(([a, b]) => [el('span', {}, a), el('b', {}, b)]))));
      const c = el('div', { class: 'cards' }); host.append(c);
      for (const it of fittedItems().sort((a, b) => a.kind.localeCompare(b.kind))) c.append(itemCard(it));
    } },
    { id: 'ore', label: 'Cargo', render(host) {
      const room = computeStats(designGrid(G)).cargo;
      const box = el('div', { class: 'section', style: 'max-width:620px' }, el('h3', {}, `Cargo ${num(cargoUsed(G))} of ${num(room)}`)); host.append(box);
      let any = false;
      for (const [id, o] of Object.entries(ORES)) { const n = G.cargo[id] || 0; if (!n) continue; any = true; box.append(el('div', { class: 'ore-row', style: 'grid-template-columns:22px 1fr 80px 120px' }, el('i', { class: 'swatch', style: `background:${o.color};color:${o.color}` }), el('span', {}, o.name), el('b', {}, num(n)), el('span', { class: 'dim' }, `about ${cr(o.price)} each`))); }
      // economy: trade goods
      for (const [id, n] of Object.entries(G.goods || {})) { if (!n) continue; any = true; box.append(el('div', { class: 'ore-row', style: 'grid-template-columns:22px 1fr 80px 120px' }, el('i', { class: 'swatch', style: `background:${GOODS[id].color};color:${GOODS[id].color}` }), el('span', {}, GOODS[id].name), el('b', {}, num(n)), el('span', { class: 'dim' }, `trade goods`))); }
      if (!any) box.append(el('p', { class: 'hint' }, 'Empty. Point a mining laser at an asteroid and hold Fire, or buy goods at a station’s Trade screen.'));
    } },
  ]);
}
