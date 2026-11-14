// The Trade screen: every good this station deals in, with the price here, the best price you have seen elsewhere
// (and where), the profit per unit, and how much fits in your hold. Pick a row to buy or sell it on the right.
// The maths lives in sim/economy.js; this file only draws it.

import { el, btn, panel, toast, num, credits as cr } from './dom.js';
import { GOODS, GOOD_IDS, market, prices, quoteBuy, quoteSell, buyGoods, sellGoods, maxBuy, remember, bestSellElsewhere, bestBuyElsewhere, avgPaid } from '../sim/economy.js';
import { researchBonus } from '../sim/research.js';
import { cargoUsed, oreUsed, designGrid, save } from '../sim/state.js';
import { computeStats } from '../sim/stats.js';
import { play } from '../core/audio.js';
import { checkGoals } from '../sim/goals.js';

let selected = null;

export function openTrade(app, redraw) {
  const G = app.G; const sys = app.gal.systems[G.system];
  const edge = () => researchBonus(G).trade;
  let mk = market(G, sys);
  const P = panel('Trade', redraw, { cls: 'trade-panel', sub: `${sys.name} · ${mk.info.name}` });
  const credLine = el('div', { class: 'stat amber' }); P.head.insertBefore(credLine, P.head.lastChild);
  const main = el('div', { class: 'tr-main' }), side = el('div', { class: 'tr-side' });
  P.body.append(el('div', { class: 'tr-wrap' }, main, side));
  const qty = { buy: 1, sell: 1 };
  if (!selected || !GOODS[selected]) selected = mk.info.makes[0];

  const room = () => computeStats(designGrid(G)).cargo;
  const free = () => Math.max(0, room() - cargoUsed(G));
  const sysName = id => app.gal.systems[id]?.name || 'Unknown';
  const ago = t => { const m = Math.max(0, Math.round(((G.playTime || 0) - t) / 60)); return m < 1 ? 'just now' : m < 90 ? `${num(m)} min ago` : `${num(m / 60)} h ago`; };

  function draw() {
    mk = market(G, sys); remember(G, mk, edge());
    credLine.textContent = cr(G.credits);
    drawMain(); drawSide();
  }

  function drawMain() {
    const head = el('div', { class: 'tr-row tr-head' }, el('span'), el('span', {}, 'Good'), el('span', {}, 'In stock'), el('span', {}, 'Buy'), el('span', {}, 'Sell'), el('span', {}, 'Best sale seen elsewhere'), el('span', {}, 'Profit per unit'), el('span', {}, 'In hold'));
    const rows = [];
    for (const id of GOOD_IDS) {
      const g = GOODS[id]; const p = prices(mk, id, edge());
      const makes = mk.info.makes.includes(id), needs = mk.info.needs.includes(id);
      const ev = mk.event && (mk.event.up?.includes(id) || mk.event.down?.includes(id));
      const best = bestSellElsewhere(G, id, sys.id);
      const profit = best ? best.price - p.buy : null;
      const level = p.buy / Math.max(1, p.normal);
      const tag = makes ? el('i', { class: 'tr-tag made' }, 'Made here') : needs ? el('i', { class: 'tr-tag wanted' }, 'Wanted here') : '';
      const evTag = ev ? el('i', { class: 'tr-tag ' + (mk.event.k > 1 ? 'hot' : 'cold') }, mk.event.name) : '';
      const row = btn('', () => { selected = id; qty.buy = 1; qty.sell = 1; draw(); }, 'tr-row' + (selected === id ? ' sel' : ''), { 'data-good': id });
      row.append(
        el('i', { class: 'tr-icon', style: `--gc:${g.color}` }, g.name[0]),
        el('span', { class: 'tr-name' }, el('b', {}, g.name), el('small', {}, g.cat, tag, evTag)),
        el('span', { class: p.stock < 5 ? 'bad' : '' }, num(p.stock)),
        el('span', { class: 'amber' }, p.stock > 0 ? cr(p.buy) : 'Sold out', level > 1.15 ? el('small', { class: 'bad' }, ' high') : level < 0.87 ? el('small', { class: 'good' }, ' low') : ''),
        el('span', {}, cr(p.sell)),
        best ? el('span', {}, cr(best.price), el('small', { class: 'dim' }, ` at ${sysName(best.sysId)}`)) : el('span', { class: 'dim' }, 'Not seen yet'),
        profit == null ? el('span', { class: 'dim' }, '—') : el('b', { class: profit > 0 ? 'good' : 'bad' }, `${profit > 0 ? '+' : ''}${cr(profit)}`),
        el('span', {}, G.goods[id] ? num(G.goods[id]) : el('span', { class: 'dim' }, '0')),
      );
      rows.push(row);
    }
    main.replaceChildren(el('div', { class: 'section tr-table' }, head, ...rows));
  }

  function drawSide() {
    const R = room(), ore = oreUsed(G), goods = cargoUsed(G) - ore;
    const hold = el('div', { class: 'section tr-hold' },
      el('div', { class: 'row between' }, el('h3', {}, 'Hold'), el('b', {}, `${num(cargoUsed(G))} / ${num(R)}`)),
      el('div', { class: 'tr-bar' }, el('i', { class: 'ore', style: `width:${Math.min(100, ore / Math.max(1, R) * 100)}%` }), el('i', { class: 'goods', style: `width:${Math.min(100, goods / Math.max(1, R) * 100)}%` })),
      el('div', { class: 'row between hint' }, el('span', {}, `Ore ${num(ore)} · goods ${num(goods)}`), el('span', {}, `${num(free())} free`)));
    const parts = [hold];
    if (mk.event) parts.push(el('div', { class: 'section tr-event ' + (mk.event.k > 1 ? 'hot' : 'cold') }, el('h3', {}, mk.event.name), el('p', {}, mk.event.blurb),
      el('span', { class: 'hint' }, `Prices ${mk.event.k > 1 ? 'up' : 'down'} ${num(Math.abs(mk.event.k - 1) * 100)}% · ends in about ${num(Math.max(1, (mk.event.endsAt - (G.playTime || 0)) / 60))} min`)));
    parts.push(tradeBox());
    parts.push(bestRuns());
    side.replaceChildren(...parts);
  }

  function tradeBox() {
    const id = selected; const g = GOODS[id]; const p = prices(mk, id, edge());
    const have = G.goods[id] || 0; const canBuy = maxBuy(G, mk, id, free(), edge());
    qty.buy = Math.max(1, Math.min(qty.buy, Math.max(1, canBuy))); qty.sell = Math.max(1, Math.min(qty.sell, Math.max(1, have)));
    const best = bestSellElsewhere(G, id, sys.id), cheap = bestBuyElsewhere(G, id, sys.id);
    const paid = avgPaid(G, id);
    const qb = quoteBuy(mk, id, qty.buy, edge()), qs = quoteSell(mk, id, qty.sell, edge());
    const stepper = (k, max) => el('div', { class: 'tr-step' },
      btn('−10', () => { qty[k] = Math.max(1, qty[k] - 10); drawSide(); }, 'small'), btn('−1', () => { qty[k] = Math.max(1, qty[k] - 1); drawSide(); }, 'small'),
      el('b', { class: 'tr-qty' }, num(qty[k])),
      btn('+1', () => { qty[k] = Math.min(Math.max(1, max), qty[k] + 1); drawSide(); }, 'small'), btn('+10', () => { qty[k] = Math.min(Math.max(1, max), qty[k] + 10); drawSide(); }, 'small'),
      btn('Max', () => { qty[k] = Math.max(1, max); drawSide(); }, 'small'));
    const kv = (a, b, cls = '') => [el('span', {}, a), el('b', { class: cls }, b)];
    const box = el('div', { class: 'section tr-box', style: `--gc:${g.color}` },
      el('div', { class: 'row' }, el('i', { class: 'tr-icon big', style: `--gc:${g.color}` }, g.name[0]), el('div', {}, el('h3', {}, g.name), el('span', { class: 'hint' }, `${g.cat} · base price ${cr(g.base)}`))),
      el('div', { class: 'kv' },
        ...kv('Buy here', p.stock > 0 ? cr(p.buy) : 'Sold out', 'amber'), ...kv('Sell here', cr(p.sell)), ...kv('In stock', num(p.stock)),
        ...kv('Best sale seen', best ? `${cr(best.price)} at ${sysName(best.sysId)} (${ago(best.t)})` : 'No other station yet'),
        ...kv('Cheapest seen', cheap ? `${cr(cheap.price)} at ${sysName(cheap.sysId)}` : '—'),
        ...kv('Profit per unit', best ? `${best.price - p.buy > 0 ? '+' : ''}${cr(best.price - p.buy)}` : '—', best ? (best.price > p.buy ? 'good' : 'bad') : ''),
        ...kv('Fits in your hold', num(free())), ...kv('You can buy', num(canBuy))),
      el('h4', {}, 'Buy'),
      stepper('buy', canBuy),
      btn(canBuy ? `Buy ${num(qb.n)} for ${cr(qb.cost)}` : free() ? (p.stock ? 'Not enough credits' : 'Sold out') : 'Hold full', () => doBuy(id, qty.buy), canBuy ? 'primary' : '', { disabled: !canBuy, 'data-act': 'buy' }),
      best && canBuy ? el('span', { class: 'hint' }, `Sold at ${sysName(best.sysId)}: about ${cr(best.price * qb.n)}, ${best.price * qb.n - qb.cost >= 0 ? 'profit' : 'loss'} ${cr(Math.abs(best.price * qb.n - qb.cost))} (prices fall as you sell)`) : '',
      el('h4', {}, `Sell — you have ${num(have)}${paid ? `, paid ${cr(paid)} each` : ''}`),
      have ? stepper('sell', have) : '',
      btn(have ? `Sell ${num(Math.min(qty.sell, have))} for ${cr(qs)}` : 'None in your hold', () => doSell(id, qty.sell), have ? 'gold' : '', { disabled: !have, 'data-act': 'sell' }),
      have && paid ? el('span', { class: 'hint ' + (qs - paid * Math.min(qty.sell, have) >= 0 ? 'good' : 'bad') }, `${qs - paid * Math.min(qty.sell, have) >= 0 ? 'Profit' : 'Loss'} on these: ${cr(Math.abs(qs - paid * Math.min(qty.sell, have)))}`) : '');
    return box;
  }

  function bestRuns() {
    const runs = GOOD_IDS.map(id => { const b = bestSellElsewhere(G, id, sys.id); const p = prices(mk, id, edge()); return b && p.stock > 0 ? { id, profit: b.price - p.buy, where: b.sysId } : null; })
      .filter(x => x && x.profit > 0).sort((a, b) => b.profit - a.profit).slice(0, 4);
    const box = el('div', { class: 'section' }, el('h3', {}, 'Best runs from here'));
    if (!runs.length) box.append(el('p', { class: 'hint' }, Object.keys(G.priceSeen || {}).length < 2 ? 'Dock at other stations to compare their prices with these.' : 'Nothing here sells for more at a station you have seen.'));
    for (const r of runs) {
      const b = btn('', () => { selected = r.id; draw(); }, 'tr-run');
      b.append(el('i', { class: 'tr-icon', style: `--gc:${GOODS[r.id].color}` }, GOODS[r.id].name[0]), el('span', {}, el('b', {}, GOODS[r.id].name), el('small', {}, `sell at ${sysName(r.where)}`)), el('b', { class: 'good' }, `+${cr(r.profit)} each`));
      box.append(b);
    }
    return box;
  }

  function doBuy(id, n) {
    const got = buyGoods(G, mk, id, n, free(), edge());
    if (!got.n) return;
    play('coin'); toast(`Bought ${num(got.n)} ${GOODS[id].name} for ${cr(got.cost)}`, 'gold'); save(G); draw(); redraw?.();
  }
  function doSell(id, n) {
    const out = sellGoods(G, mk, id, n, edge());
    if (!out.n) return;
    play('coin'); toast(`Sold ${num(out.n)} ${GOODS[id].name} for ${cr(out.got)}`, 'gold');
    const g = checkGoals(G); if (g) app.goalDone(g);
    save(G); draw(); redraw?.();
  }
  draw();
}
