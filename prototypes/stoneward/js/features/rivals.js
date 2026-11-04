// Rival kingdoms on screen (M8): Info → Kingdoms (stance, opinion, gifts, tribute), Info → Market
// (allies only: what to sell above how much, what to buy up to how much), caravans and rival town
// markers on the map.

import { hooks } from '../ui/hooks.js';

const STANCE = { ally: ['🤝 Ally', 'var(--green)'], neutral: ['⚖ Neutral', 'var(--dim)'], enemy: ['⚔ Enemy', 'var(--red)'] };

hooks.infoTabs.push({
  id: 'kingdoms', label: 'Kingdoms',
  render(ui, head) {
    const r = ui.app.stream?.town?.rivals; const p = ui.panel(''); p.append(head);
    if (!r?.list?.length) { p.append(ui.hint('No other kingdoms known yet.')); return; }
    const cards = [];
    for (const rv of r.list) {
      const c = document.createElement('div'); c.className = 'card';
      const [label, col] = STANCE[rv.stance];
      const bar = Math.round((rv.opinion + 100) / 2);
      c.innerHTML = `<b>${ui.esc(rv.name)}</b><span style="color:${col}">${label} · opinion ${rv.opinion > 0 ? '+' : ''}${rv.opinion}</span><div class="bar"><i style="width:${bar}%;background:${col}"></i></div><span>👪 ${rv.pop} in ${rv.towns.length} town${rv.towns.length > 1 ? 's' : ''} · army about ${rv.army} · ${rv.temper}${rv.road ? ' · road shared' : ''}</span>`;
      const row = document.createElement('div'); row.className = 'row';
      row.append(ui.btn('Gift 🪙50', async () => { const res = await ui.link().order({ t: 'gift', rival: rv.id, gold: 50 }); if (res?.error) ui.toast(res.error, 'bad'); }));
      if (rv.demand) row.append(ui.btn(`Pay 🪙${rv.demand}`, () => ui.link().order({ t: 'tribute', rival: rv.id, pay: true })), ui.btn('Refuse', () => ui.link().order({ t: 'tribute', rival: rv.id, pay: false })));
      row.append(ui.btn('Show', () => ui.camera()?.flyTo(rv.towns[0][0], rv.towns[0][1], 1.5, 900)));
      c.append(row); cards.push(c);
    }
    p.append(ui.pagerOf(cards, 'kingdoms', 2));
  },
});

hooks.infoTabs.push({
  id: 'market', label: 'Market',
  render(ui, head) {
    const r = ui.app.stream?.town?.rivals; const p = ui.panel(''); p.append(head);
    if (!r) return;
    const allies = r.list.filter(x => x.stance === 'ally');
    p.append(ui.hint(allies.length ? `Caravans from ${allies.map(a => a.name).join(', ')} buy and sell here. Set what to sell (above how much you keep) and what to buy.` : 'Only allies trade. Win one over with gifts.'));
    const G = ui.data.goods, stock = ui.app.stream?.town?.stock || {};
    const m = { sell: { ...r.market.sell }, buy: { ...r.market.buy } };
    const list = [];
    const goods = Object.keys(G).filter(g => r.prices[g] && (stock[g] || m.sell[g] != null || m.buy[g] != null || ['bread', 'ale', 'cloth', 'iron', 'tools', 'furniture'].includes(g)));
    for (const g of goods) {
      const row = document.createElement('div'); row.className = 'row';
      const sell = m.sell[g], buy = m.buy[g];
      row.innerHTML = `<span style="flex:1">${G[g].icon} ${ui.esc(G[g].name)} <small>(${stock[g] || 0}, 🪙${r.prices[g]})</small></span>`;
      const save = () => ui.link().order({ t: 'market', sell: m.sell, buy: m.buy });
      row.append(
        ui.btn(sell != null ? `Sell above ${sell}` : 'Sell', () => { m.sell[g] = sell == null ? Math.max(10, Math.round((stock[g] || 0) / 2)) : sell >= 200 ? undefined : sell + 20; if (m.sell[g] === undefined) delete m.sell[g]; save(); }),
        ui.btn(buy != null ? `Buy to ${buy}` : 'Buy', () => { m.buy[g] = buy == null ? 20 : buy >= 120 ? undefined : buy + 20; if (m.buy[g] === undefined) delete m.buy[g]; save(); }),
      );
      list.push(row);
    }
    p.append(ui.pager(list, 'market'));
  },
});

hooks.sprites.push((cam, out, ui) => {
  const r = ui.app.stream?.town?.rivals; if (!r) return;
  for (const [x, y] of r.caravans) { const sx = ui.near(x, cam.x, ui.app.world.W); out.push([sx - 1.3, y - 1.7, 2.6, 1.4, 0.7, 0.55, 0.3, 1]); out.push([sx - 1.3, y - 2.4, 2.6, 0.8, 0.85, 0.8, 0.7, 1]); }
});
hooks.overlay.push((cam, out, ui) => {
  const r = ui.app.stream?.town?.rivals; if (!r || cam.ppc > 2.5) return;
  const s = Math.max(1.5, 5 / cam.ppc), W = ui.app.world.W;
  for (const rv of r.list) for (const [x, y] of rv.towns) {
    const nx = ui.near(x, cam.x, W);
    out.push([nx - 2 * s, y - 2 * s, 4 * s, 4 * s, 0, 0, 0, 0.6]);
    out.push([nx - 1.5 * s, y - 1.5 * s, 3 * s, 3 * s, ...rv.color, 0.95]);
  }
});
