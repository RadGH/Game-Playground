// City screens and data layers (M4): Info → Economy and People, the Layers tab's coverage views,
// the tax setting. Everything reads the worker's town snapshot (stream.town) — nothing here changes
// the world except through orders.

import { hooks } from '../ui/hooks.js';

const NEED_NAMES = { water: 'water', market: 'a market', faith: 'a church', tavern: 'a tavern', health: 'a healer', food: 'food', safety: 'safety', bread: 'bread', ale: 'ale', cloth: 'cloth', furniture: 'furniture', jewelry: 'jewellery' };
const LEVELS = ['Tent', 'Hut', 'Cottage', 'House', 'Townhouse', 'Manor'];

// ---------------------------------------------------------------- Economy
let econPage = 0;
hooks.infoTabs.push({
  id: 'economy', label: 'Economy',
  render(ui, head) {
    const t = ui.app.stream?.town; const p = ui.panel(''); p.append(head);
    const town = t?.towns?.[0]; if (!town) return;
    const G = ui.data.goods;
    const last = town.days.at(-1) || town.today;
    const label = town.days.length ? 'Yesterday' : 'Today so far';
    const box = document.createElement('div'); box.className = 'list';
    const goods = Object.keys(G).filter(g => (town.stock[g] || 0) || last.made[g] || last.used[g] || town.today.made[g]);
    // pages of four (the game never scrolls a panel: owner's phones blank the map behind one)
    const pages = Math.max(1, Math.ceil(goods.length / 4));
    econPage = Math.min(econPage, pages - 1);
    for (const g of goods.slice(econPage * 4, econPage * 4 + 4)) {
      const n = town.stock[g] || 0, mk = last.made[g] || 0, us = last.used[g] || 0;
      const hist = town.days.map(d => d.made[g] || 0);
      const row = document.createElement('div'); row.className = 'card';
      const trend = mk - us;
      row.innerHTML = `<span><b>${G[g].icon} ${ui.esc(G[g].name)}</b> · ${n} in store</span><span>${label}: made ${mk}, used ${us} <span style="color:${trend >= 0 ? 'var(--green)' : 'var(--red)'}">(${trend >= 0 ? '+' : ''}${trend})</span></span>${spark(hist)}`;
      box.append(row);
    }
    if (!goods.length) box.append(ui.hint('Nothing made yet.'));
    p.append(box);
    if (pages > 1) { const nav = document.createElement('div'); nav.className = 'row'; nav.append(ui.btn('‹', () => { econPage = (econPage - 1 + pages) % pages; ui.refreshDock(); }), document.createTextNode(` ${econPage + 1} / ${pages} `), ui.btn('›', () => { econPage = (econPage + 1) % pages; ui.refreshDock(); })); p.append(nav); }
    const tax = document.createElement('div'); tax.className = 'row';
    tax.append(document.createTextNode('Taxes: '));
    for (const [lv, name] of [['low', 'Low'], ['normal', 'Normal'], ['high', 'High']]) {
      const b = ui.btn(name, async () => { await ui.link().order({ t: 'tax', town: town.id, level: lv }); });
      b.classList.toggle('on', town.tax === lv); tax.append(b);
    }
    p.append(tax, ui.hint('Higher taxes bring more gold and make people less happy.'));
  },
});
function spark(vals) {
  if (vals.length < 2) return '';
  const max = Math.max(1, ...vals), w = 120, h = 18;
  const pts = vals.map((v, k) => `${(k / (vals.length - 1) * w).toFixed(1)},${(h - v / max * h).toFixed(1)}`).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="#e2b65a" stroke-width="1.5"/></svg>`;
}

// ---------------------------------------------------------------- People
hooks.infoTabs.push({
  id: 'people', label: 'People',
  render(ui, head) {
    const t = ui.app.stream?.town; const p = ui.panel(''); p.append(head);
    for (const town of t?.towns || []) {
      const c = document.createElement('div'); c.className = 'card';
      const homes = LEVELS.map((n, k) => [n, town.homesBy[['tent', 'hut', 'cottage', 'house', 'townhouse', 'manor'][k]] || 0]).filter(([, n]) => n).map(([n, k]) => `${n} ${k}`).join(' · ') || 'no homes yet';
      const miss = Object.entries(town.missing).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([m, n]) => `${n} without ${NEED_NAMES[m] || m}`).join(', ');
      const face = town.mood > 0.75 ? '🙂' : town.mood > 0.45 ? '😐' : '🙁';
      c.innerHTML = `<b>${ui.esc(town.name)}</b><span>👪 ${town.pop} (${town.trend >= 0 ? '+' : ''}${town.trend} since yesterday) · mood ${face} ${Math.round(town.mood * 100)}%</span><span>Homes: ${homes}</span><span>${town.workers} working · ${town.jobless} free to haul and build${town.homeless ? ` · ${town.homeless} without a home` : ''}</span>${miss ? `<span>Holding homes back: ${miss}</span>` : ''}`;
      p.append(c);
    }
  },
});

// ---------------------------------------------------------------- data layers
// One overlay: every building in view tinted by the chosen layer. Homes carry their needs; the
// resources layer is the found-node markers main.js already draws.
const LAYERS = [
  ['none', 'Off'], ['level', 'Home level'], ['water', 'Water'], ['food', 'Food'], ['faith', 'Church'], ['market', 'Market'],
  ['tavern', 'Tavern'], ['health', 'Healer'], ['value', 'Land value'], ['safety', 'Safety'], ['fire', 'Fire cover'],
];
let layer = 'none';
hooks.tabs.push({
  id: 'layers2', label: 'Views',
  render(ui) {
    const p = ui.panel('<h3>Data views</h3>');
    const row = document.createElement('div'); row.className = 'groups';
    for (const [id, name] of LAYERS) { const b = ui.btn(name, () => { layer = id; ui.refreshDock(); }); b.classList.toggle('on', layer === id); row.append(b); }
    p.append(row, ui.hint(LEGEND[layer] || 'Map marks: a coloured square in a dotted ring is a resource seam you found; a dark square with a red rim is a monster lair. Tap either to see what it is.'), ui.pager(ui.mapToggles(), 'views', 'grid', 2));
  },
});
const LEGEND = {
  level: 'Darker gold = a higher home. Grey = not a home.',
  water: 'Green homes have a well in reach; red ones do not.', food: 'Green homes have enough kinds of food.',
  faith: 'Green homes have a church in reach.', market: 'Green homes have a market in reach.',
  tavern: 'Green homes have a tavern in reach.', health: 'Green homes have a healer in reach.',
  value: 'Brighter = nicer: gardens, fountains and services nearby.',
  safety: 'Red = unsafe, green = well patrolled (guards arrive soon).', fire: 'Green = a fire station in reach (fire stations arrive soon).',
};
hooks.overlay.push((cam, out, ui) => {
  if (layer === 'none') return;
  const list = ui.app.stream?.town?.layer || [];
  const W = ui.app.world.W;
  for (const b of list) {
    let c = null;
    if (layer === 'level') c = b.level < 0 ? [0.5, 0.5, 0.5, 0.25] : [1, 0.85 - b.level * 0.1, 0.3, 0.25 + b.level * 0.1];
    else if (layer === 'value') { if (b.level < 0) continue; const v = Math.min(1, b.beauty / 8 + Object.values(b.cover || {}).filter(Boolean).length / 8); c = [0.3 + v * 0.7, 0.3 + v * 0.6, 0.9 - v * 0.6, 0.45]; }
    else if (layer === 'safety') { if (b.safety == null) c = [0.6, 0.6, 0.6, 0.2]; else { const v = b.safety; c = [1 - v, v, 0.2, 0.45]; } }
    else if (layer === 'fire') { const v = b.cover?.fire ? 1 : 0; if (b.level < 0 && !b.cover) continue; c = v ? [0.3, 0.85, 0.3, 0.4] : [0.9, 0.3, 0.25, 0.4]; }
    else { if (b.level < 0) continue; const ok = layer === 'food' ? !b.missing.includes('food') : !!b.cover?.[layer]; c = ok ? [0.3, 0.85, 0.3, 0.45] : [0.9, 0.3, 0.25, 0.45]; }
    out.push([ui.near(b.x, cam.x, W), b.y - 1, b.w, b.h + 1, ...c]);
  }
});
