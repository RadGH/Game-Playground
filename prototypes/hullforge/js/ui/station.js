// Docked at a station: the services list on the left (the station turns slowly behind it), and one screen per
// service — Shipyard (the builder), Outfitter (buy and sell parts), Market (sell ore), Repair, Star map, Hold.

import { $, el, btn, panel, tabs, toast, num, credits as cr } from './dom.js';
import { itemCard } from './cards.js';
import { shopStock, orePrices, looseItems, installedUids, repairCost, designGrid, liveGrid, cargoUsed, save } from '../sim/state.js';
import { makeItem, itemPrice, itemName } from '../sim/items.js';
import { computeStats } from '../sim/stats.js';
import { checkGoals } from '../sim/goals.js';
import { ORES, STRUCTURE } from '../data/blocks.js';
import { play } from '../core/audio.js';
import { ask } from '../../../../shared/dialog.js';
import { researchBonus } from '../sim/research.js';   // economy

const SELL_SHARE = 0.3;

export function openStation(app) {
  const G = app.G; const sys = app.gal.systems[G.system];
  for (const p of [...$('#panels').children]) p.remove();
  const P = panel(`${sys.name} Station`, null, { cls: 'see-through', noClose: true, sub: `Danger ${sys.danger}` });
  P.root.closePanel = () => app.openMenu();       // Esc on the station's own list opens the menu
  P.root.dataset.station = '1';
  const credLine = el('div', { class: 'stat' });
  P.head.append(credLine, btn('☰', () => app.openMenu(), 'icon-btn', { 'aria-label': 'Menu' }));
  const body = el('div', { class: 'station-side col' }); P.body.append(body);
  function draw() {
    credLine.textContent = cr(G.credits);
    const st = computeStats(designGrid(G));
    const cost = repairCost(G); const used = cargoUsed(G);
    body.replaceChildren(
      el('div', { class: 'section' }, el('div', { class: 'row between' }, el('div', {}, el('h3', {}, G.shipName), el('span', { class: 'dim' }, `${num(st.blocks)} blocks · rating ${num(st.rating)} · ${num(st.turrets.length)} turrets`)),
        el('div', { style: 'text-align:right' }, el('div', { class: 'big-stat amber' }, cr(G.credits)), el('span', { class: 'dim' }, `Cargo ${num(used)} / ${num(st.cargo)}`)))),
      el('div', { class: 'station-grid' },
        svc('Launch', 'Back out into the system', () => app.launch(), 'launch', 'F'),
        svc('Shipyard', 'Build, refit and paint your ship', () => openShipyard(app, draw)),
        svc('Outfitter', `Buy and sell parts (danger ${sys.danger} stock)`, () => openOutfitter(app, draw)),
        svc('Market', used ? `Sell your ore — ${num(used)} in the hold` : 'Ore prices here', () => openMarket(app, draw)),
        svc('Repair', cost ? `Fix your ship — ${cr(cost)}` : 'Your ship is in one piece', () => openRepair(app, draw), cost ? 'gold' : ''),
        svc('Star map', 'Plan a jump', () => app.openMap()),
        svc('Hold', 'Your parts and ore', () => app.openHold()),
        svc('Goals', 'What to try next', () => app.openGoals()),
        ...app.services.filter(x => !x.when || x.when(app)).map(x => svc(x.title, typeof x.sub === 'function' ? x.sub(app) : x.sub || '', () => x.open(app, draw), x.cls || '')),
      ),
    );
  }
  draw();
  app.redrawStation = draw;
  // F launches from the station list
  const onKey = e => { if (e.code === 'KeyF' && app.mode === 'docked' && $('#panels').lastElementChild === P.root) app.launch(); };
  addEventListener('keydown', onKey);
  const obs = new MutationObserver(() => { if (!P.root.isConnected) { removeEventListener('keydown', onKey); obs.disconnect(); } });
  obs.observe($('#panels'), { childList: true });
}
function svc(title, sub, fn, cls = '', key = '') {
  const b = btn('', fn, 'svc ' + cls, { 'data-svc': title.toLowerCase().replace(/ /g, '-') }); b.append(el('b', {}, title, key ? el('span', { class: 'key' }, key) : ''), el('small', {}, sub)); return b;
}

function openShipyard(app, redraw) { import('./builder.js').then(m => m.openBuilder(app, () => { redraw(); app.redrawStation?.(); })).catch(e => console.error(e)); }

// ------------------------------------------------------------------ outfitter
function openOutfitter(app, redraw) {
  const G = app.G; const sys = app.gal.systems[G.system];
  const P = panel('Outfitter', redraw, { sub: `${sys.name} · stock changes every time you arrive` });
  const credLine = el('div', { class: 'stat amber' }, cr(G.credits)); P.head.insertBefore(credLine, P.head.lastChild);
  const fitted = () => [...designGrid(G).cells.values()].filter(b => b.item).map(b => b.item);
  const T = tabs(P.body, [
    { id: 'buy', label: 'Buy', render(host) {
      const visit = G.stock[G.system] || { visits: 1, sold: [] };
      const stock = shopStock(sys, visit.visits, researchBonus(G).shopTier);   // economy: research can raise the Mk on sale
      const cards = el('div', { class: 'cards' }); host.append(cards);
      stock.forEach((s, i) => {
        if (visit.sold.includes(i)) return;
        const it = { uid: -1 - i, kind: s.kind, tier: s.tier, rarity: s.rarity }; const price = itemPrice(it);
        const can = G.credits >= price;
        cards.append(itemCard(it, { fitted: fitted(), price: cr(price), why: can ? '' : `You need ${cr(price - G.credits)} more.`, actions: [btn('Buy', () => {
          if (G.credits < price) return;
          G.credits -= price; visit.sold.push(i); G.stock[G.system] = visit;
          const real = makeItem(s.kind, s.tier, s.rarity); G.items.push(real);
          play('coin'); toast(`Bought ${itemName(real)} — fit it in the Shipyard.`, 'good'); save(G);
          credLine.textContent = cr(G.credits); T.redraw();
        }, can ? 'primary' : '', { disabled: !can })] }));
      });
    } },
    { id: 'sell', label: 'Sell parts', render(host) {
      const loose = looseItems(G);
      if (!loose.length) { host.append(el('p', { class: 'hint' }, 'No spare parts. Parts fitted to your ship are sold from the Shipyard: take them off first.')); return; }
      const cards = el('div', { class: 'cards' }); host.append(cards);
      for (const it of loose) {
        const price = Math.round(itemPrice(it) * SELL_SHARE);
        cards.append(itemCard(it, { fitted: fitted(), price: cr(price), actions: [btn(`Sell for ${cr(price)}`, async () => {
          if (it.rarity >= 2 && !(await ask({ title: 'Sell this part?', text: `${itemName(it)} sells for ${cr(price)}.`, ok: 'Sell' }))) return;
          G.items = G.items.filter(x => x !== it); G.credits += price; G.stats.earned += price; play('coin'); save(G);
          credLine.textContent = cr(G.credits); T.redraw();
        })] }));
      }
    } },
  ]);
}

// ------------------------------------------------------------------ market
function openMarket(app, redraw) {
  const G = app.G; const sys = app.gal.systems[G.system]; const prices = orePrices(sys);
  const P = panel('Market', redraw, { sub: 'Ore prices change from system to system' });
  const draw = () => {
    P.body.replaceChildren();
    const box = el('div', { class: 'section', style: 'max-width:720px' }); P.body.append(box);
    box.append(el('div', { class: 'ore-row dim' }, el('span'), el('b', {}, 'Ore'), el('b', {}, 'In hold'), el('b', {}, 'Price here'), el('span')));
    let total = 0;
    for (const [id, o] of Object.entries(ORES)) {
      const n = G.cargo[id] || 0; total += n * prices[id];
      box.append(el('div', { class: 'ore-row' }, el('i', { class: 'swatch', style: `background:${o.color};color:${o.color}` }), el('span', {}, o.name), el('span', {}, num(n)), el('span', { class: 'amber' }, `${cr(prices[id])} each`),
        n ? btn(`Sell ${num(n)} for ${cr(n * prices[id])}`, () => sell(id), 'small') : el('span', { class: 'dim' }, '—')));
    }
    box.append(el('div', { class: 'row end', style: 'margin-top:12px' }, total ? btn(`Sell all ore for ${cr(total)}`, () => { for (const id of Object.keys(ORES)) sell(id, true); draw(); }, 'gold') : el('span', { class: 'dim' }, 'Your hold has no ore. Mining lasers cut it from asteroids.')));
  };
  function sell(id, quiet) {
    const n = G.cargo[id] || 0; if (!n) return;
    const v = n * prices[id]; G.cargo[id] = 0; G.credits += v; G.stats.earned += v; G.stats.sold += n;
    play('coin'); if (!quiet) draw();
    toast(`Sold ${num(n)} ${ORES[id].name} for ${cr(v)}`, 'gold');
    const g = checkGoals(G); if (g) app.goalDone(g);
    save(G);
  }
  draw();
}

// ------------------------------------------------------------------ repair
function openRepair(app, redraw) {
  const G = app.G;
  const P = panel('Repair', redraw);
  const draw = () => {
    P.body.replaceChildren();
    const cost = repairCost(G); const d = designGrid(G);
    const missing = Object.values(G.hp).filter(h => h <= 0).length, hurt = Object.values(G.hp).filter(h => h > 0).length;
    const box = el('div', { class: 'section', style: 'max-width:620px' }); P.body.append(box);
    if (!cost) { box.append(el('h3', {}, 'Your ship is in one piece.'), el('p', { class: 'hint' }, `${num(d.cells.size)} blocks, every one at full health.`)); return; }
    box.append(el('h3', {}, `${num(missing)} blocks shot off, ${num(hurt)} damaged`), el('p', {}, `Full repair: `, el('b', { class: 'amber' }, cr(cost))));
    const can = G.credits >= cost;
    box.append(el('div', { class: 'row wrap' },
      btn(`Repair everything — ${cr(cost)}`, () => { G.credits -= cost; G.hp = {}; play('rebuilt'); save(G); toast('Repaired.', 'good'); draw(); }, can ? 'primary' : '', { disabled: !can }),
      !can && G.credits > 0 ? btn(`Repair what ${cr(G.credits)} covers`, () => partial(), 'gold') : ''));
  };
  function partial() {
    // fix blocks one by one (biggest gaps first) until the money runs out
    const d = designGrid(G); const entries = Object.entries(G.hp).sort((a, b) => a[1] - b[1]);
    for (const [k] of entries) {
      const before = repairCost(G); const keep = G.hp[k]; delete G.hp[k];
      const c = before - repairCost(G); if (c > G.credits) { G.hp[k] = keep; break; }
      G.credits -= c;
    }
    play('rebuilt'); save(G); draw();
  }
  draw();
}
export { SELL_SHARE };
