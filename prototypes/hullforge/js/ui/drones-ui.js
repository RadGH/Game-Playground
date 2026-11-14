// The Drone hangar (a station service): your ship's Drone bays and the drone loaded in each, every drone you own
// (load, unload, sell), and drones for sale at this station's danger.

import { el, btn, panel, tabs, toast, num, credits as cr } from './dom.js';
import { play } from '../core/audio.js';
import { ask } from '../../../../shared/dialog.js';
import { save, designGrid } from '../sim/state.js';
import { computeStats } from '../sim/stats.js';
import { itemName } from '../sim/items.js';
import { makeDrone, droneName, dronePrice, DRONE_IDS } from '../sim/drones.js';
import { droneCard } from './merchant.js';
import { rng, hash, clamp } from '../core/math.js';

export const DRONE_SELL = 0.5;   // a drone sells back for half its price

/** Drones for sale here (changes each arrival, like the outfitter). */
function forSale(G, sys) {
  const visits = G.stock[G.system]?.visits || 1; const r = rng(hash(sys.seed, 'drones', visits));
  const tier = clamp(Math.round(1 + (sys.danger - 1) * 0.45), 1, 3);
  return DRONE_IDS.map((k, i) => makeDroneStub(k, Math.max(1, tier - (r() < 0.4 ? 1 : 0)), r() < 0.15 + sys.danger * 0.04 ? 2 : r() < 0.4 ? 1 : 0, -1 - i));
}
const makeDroneStub = (drone, tier, rarity, uid) => ({ uid, kind: 'drone', drone, tier, rarity });

export function openHangar(app, redraw) {
  const G = app.G; const sys = app.gal.systems[G.system];
  const P = panel('Drone hangar', redraw, { sub: 'Each Drone bay on your ship holds one drone · B launches and recalls them' });
  const credLine = el('div', { class: 'stat amber' }); P.head.insertBefore(credLine, P.head.lastChild);
  const sold = (G.stock[G.system] ||= { visits: 1, sold: [] }).droneSold ||= [];
  const bays = () => computeStats(designGrid(G)).bays;
  const loadedIn = d => Object.entries(G.droneBays).find(([, u]) => u === d.uid)?.[0];
  const T = tabs(P.body, [
    { id: 'bays', label: 'Your drones', render(host) {
      credLine.textContent = cr(G.credits);
      const B = bays();
      const sec = el('div', { class: 'section', style: 'max-width:1100px' }, el('h3', { style: 'margin-bottom:8px' }, `Drone bays on your ship: ${num(B.length)}`));
      host.append(sec);
      if (!B.length) sec.append(el('p', { class: 'hint' }, 'Your ship has no Drone bay. Outfitters sell them; fit one in the Shipyard like any part.'));
      const list = el('div', { class: 'w-bays' }); sec.append(list);
      B.forEach((bay, i) => {
        const cur = G.drones.find(d => d.uid === G.droneBays[bay.item.uid]);
        const row = el('div', { class: 'row' });
        row.append(btn('Empty', () => { delete G.droneBays[bay.item.uid]; save(G); T.redraw(); }, cur ? 'small' : 'small on'));
        for (const d of G.drones) {
          const elsewhere = loadedIn(d) && +loadedIn(d) !== bay.item.uid;
          row.append(btn(droneName(d), () => { for (const [k, u] of Object.entries(G.droneBays)) if (u === d.uid) delete G.droneBays[k]; G.droneBays[bay.item.uid] = d.uid; play('rebuilt'); save(G); T.redraw(); }, cur === d ? 'small on' : 'small', { 'data-tip': elsewhere ? 'Moves it from its other bay' : null }));
        }
        list.append(el('div', { class: 'w-bay' }, el('span', {}, `Bay ${i + 1} · ${itemName(bay.item)}`), row));
      });
      if (!G.drones.length) { host.append(el('p', { class: 'hint', style: 'margin:10px 4px' }, 'You own no drones yet: buy one in the next tab.')); return; }
      const cards = el('div', { class: 'cards' }); host.append(cards);
      for (const d of G.drones) {
        const bayUid = loadedIn(d); const price = Math.round(dronePrice(d) * DRONE_SELL);
        cards.append(droneCard(d, { note: bayUid ? `Loaded in bay ${B.findIndex(b => b.item.uid === +bayUid) + 1 || '(not fitted now)'}` : 'Not loaded', actions: [btn(`Sell for ${cr(price)}`, async () => {
          if (!(await ask({ title: 'Sell this drone?', text: `${droneName(d)} sells for ${cr(price)}.`, ok: 'Sell' }))) return;
          G.drones = G.drones.filter(x => x !== d); if (bayUid) delete G.droneBays[bayUid]; G.credits += price; G.stats.earned += price;
          play('coin'); save(G); T.redraw(); redraw?.();
        }, 'small')] }));
      }
    } },
    { id: 'buy', label: 'Buy drones', render(host) {
      credLine.textContent = cr(G.credits);
      const cards = el('div', { class: 'cards' }); host.append(cards);
      forSale(G, sys).forEach((stub, i) => {
        if (sold.includes(i)) return;
        const price = dronePrice(stub); const can = G.credits >= price;
        cards.append(droneCard(stub, { price: cr(price), actions: [btn('Buy', () => {
          if (G.credits < price) return;
          G.credits -= price; sold.push(i);
          const d = makeDrone(stub.drone, stub.tier, stub.rarity); G.drones.push(d);
          const free = bays().find(b => !G.droneBays[b.item.uid]); if (free) G.droneBays[free.item.uid] = d.uid;
          play('coin'); toast(`Bought ${droneName(d)}${free ? ' and loaded it into a free bay' : ''}.`, 'good'); save(G); T.redraw(); redraw?.();
        }, can ? 'primary' : '', { disabled: !can })], note: can ? '' : `You need ${cr(price - G.credits)} more.` }));
      });
    } },
  ]);
  return P;
}
